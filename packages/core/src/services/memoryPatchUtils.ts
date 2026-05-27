/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as Diff from 'diff';
import type { StructuredPatch } from 'diff';
import type { Config } from '../config/config.js';
import { Storage } from '../config/storage.js';
import {
  getGlobalMemoryFilePath,
  PROJECT_MEMORY_INDEX_FILENAME,
} from '../tools/memoryTool.js';
import { isNodeError } from '../utils/errors.js';
import { debugLogger } from '../utils/debugLogger.js';
import { isSubpath } from '../utils/paths.js';

export function getAllowedSkillPatchRoots(config: Config): string[] {
  return Array.from(
    new Set(
      [Storage.getUserSkillsDir(), config.storage.getProjectSkillsDir()].map(
        (root) => path.resolve(root),
      ),
    ),
  );
}

async function resolvePathWithExistingAncestors(
  targetPath: string,
): Promise<string | undefined> {
  const missingSegments: string[] = [];
  let currentPath = path.resolve(targetPath);

  while (true) {
    try {
      const realCurrentPath = await fs.realpath(currentPath);
      return path.join(realCurrentPath, ...missingSegments.reverse());
    } catch (error) {
      if (
        !isNodeError(error) ||
        (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')
      ) {
        return undefined;
      }

      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        return undefined;
      }

      missingSegments.push(path.basename(currentPath));
      currentPath = parentPath;
    }
  }
}

async function getCanonicalAllowedSkillPatchRoots(
  config: Config,
): Promise<string[]> {
  const canonicalRoots = await Promise.all(
    getAllowedSkillPatchRoots(config).map((root) =>
      resolvePathWithExistingAncestors(root),
    ),
  );
  return Array.from(
    new Set(
      canonicalRoots.filter((root): root is string => typeof root === 'string'),
    ),
  );
}

export async function resolveAllowedSkillPatchTarget(
  targetPath: string,
  config: Config,
): Promise<string | undefined> {
  const canonicalTargetPath =
    await resolvePathWithExistingAncestors(targetPath);
  if (!canonicalTargetPath) {
    return undefined;
  }

  const allowedRoots = await getCanonicalAllowedSkillPatchRoots(config);
  if (allowedRoots.some((root) => isSubpath(root, canonicalTargetPath))) {
    return canonicalTargetPath;
  }

  return undefined;
}

export async function isAllowedSkillPatchTarget(
  targetPath: string,
  config: Config,
): Promise<boolean> {
  return (
    (await resolveAllowedSkillPatchTarget(targetPath, config)) !== undefined
  );
}

function isAbsoluteSkillPatchPath(targetPath: string): boolean {
  return targetPath !== '/dev/null' && path.isAbsolute(targetPath);
}

const GIT_DIFF_PREFIX_RE = /^[ab]\//;

/**
 * Strips git-style `a/` or `b/` prefixes from a patch filename.
 * Logs a warning when stripping occurs so we can track LLM formatting issues.
 */
function stripGitDiffPrefix(fileName: string): string {
  if (GIT_DIFF_PREFIX_RE.test(fileName)) {
    const stripped = fileName.replace(GIT_DIFF_PREFIX_RE, '');
    debugLogger.warn(
      `[memoryPatchUtils] Stripped git diff prefix from patch header: "${fileName}" → "${stripped}"`,
    );
    return stripped;
  }
  return fileName;
}

interface ValidatedSkillPatchHeader {
  targetPath: string;
  isNewFile: boolean;
}

type ValidateParsedSkillPatchHeadersResult =
  | {
      success: true;
      patches: ValidatedSkillPatchHeader[];
    }
  | {
      success: false;
      reason: 'missingTargetPath' | 'invalidPatchHeaders';
      targetPath?: string;
    };

export function validateParsedSkillPatchHeaders(
  parsedPatches: StructuredPatch[],
): ValidateParsedSkillPatchHeadersResult {
  const validatedPatches: ValidatedSkillPatchHeader[] = [];

  for (const patch of parsedPatches) {
    const oldFileName = patch.oldFileName
      ? stripGitDiffPrefix(patch.oldFileName)
      : patch.oldFileName;
    const newFileName = patch.newFileName
      ? stripGitDiffPrefix(patch.newFileName)
      : patch.newFileName;

    if (!oldFileName || !newFileName) {
      return {
        success: false,
        reason: 'missingTargetPath',
      };
    }

    if (oldFileName === '/dev/null') {
      if (!isAbsoluteSkillPatchPath(newFileName)) {
        return {
          success: false,
          reason: 'invalidPatchHeaders',
          targetPath: newFileName,
        };
      }

      validatedPatches.push({
        targetPath: newFileName,
        isNewFile: true,
      });
      continue;
    }

    if (
      !isAbsoluteSkillPatchPath(oldFileName) ||
      !isAbsoluteSkillPatchPath(newFileName) ||
      oldFileName !== newFileName
    ) {
      return {
        success: false,
        reason: 'invalidPatchHeaders',
        targetPath: newFileName,
      };
    }

    validatedPatches.push({
      targetPath: newFileName,
      isNewFile: false,
    });
  }

  return {
    success: true,
    patches: validatedPatches,
  };
}

export async function isProjectSkillPatchTarget(
  targetPath: string,
  config: Config,
): Promise<boolean> {
  const canonicalTargetPath =
    await resolvePathWithExistingAncestors(targetPath);
  if (!canonicalTargetPath) {
    return false;
  }

  const canonicalProjectSkillsDir = await resolvePathWithExistingAncestors(
    config.storage.getProjectSkillsDir(),
  );
  if (!canonicalProjectSkillsDir) {
    return false;
  }

  return isSubpath(canonicalProjectSkillsDir, canonicalTargetPath);
}

export function hasParsedPatchHunks(parsedPatches: StructuredPatch[]): boolean {
  return (
    parsedPatches.length > 0 &&
    parsedPatches.every((patch) => patch.hunks.length > 0)
  );
}

export type InboxMemoryPatchKind = 'private' | 'global';

export function getMemoryPatchRoot(
  memoryDir: string,
  kind: InboxMemoryPatchKind,
): string {
  return path.join(memoryDir, '.inbox', kind);
}

function isSubpathOrSame(childPath: string, parentPath: string): boolean {
  return isSubpath(parentPath, childPath);
}

export function normalizeInboxMemoryPatchPath(
  relativePath: string,
): string | undefined {
  if (
    relativePath.length === 0 ||
    path.isAbsolute(relativePath) ||
    relativePath.includes('\\')
  ) {
    return undefined;
  }

  const normalizedPath = path.posix.normalize(relativePath);
  if (
    normalizedPath === '.' ||
    normalizedPath.startsWith('../') ||
    normalizedPath === '..' ||
    !normalizedPath.endsWith('.patch')
  ) {
    return undefined;
  }
  return normalizedPath;
}

/**
 * Returns coarse directory roots (or single-file roots) used for canonical
 * containment checks before the kind-specific target validator runs.
 *
 * - `private` is rooted at the project memory directory, then narrowed to
 *   direct memory markdown documents by `isAllowedPrivateMemoryDocumentPath`.
 * - `global` is intentionally a single-file allowlist: the only writeable
 *   global file is the personal `~/.gemini/GEMINI.md`. Other files under
 *   `~/.gemini/` (settings, credentials, oauth, keybindings, etc.) are off-limits.
 */
export function getAllowedMemoryPatchRoots(
  config: Config,
  kind: InboxMemoryPatchKind,
): string[] {
  switch (kind) {
    case 'private':
      return [path.resolve(config.storage.getProjectMemoryTempDir())];
    case 'global':
      return [path.resolve(getGlobalMemoryFilePath())];
    default:
      throw new Error(`Unknown memory patch kind: ${kind as string}`);
  }
}

export interface MemoryPatchTargetValidationContext {
  kind: InboxMemoryPatchKind;
  allowedRoots: string[];
  privateMemoryDirs: string[];
  globalMemoryFiles: string[];
}

function hasMarkdownExtension(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.md');
}

function isAllowedPrivateMemoryFileName(fileName: string): boolean {
  if (fileName === PROJECT_MEMORY_INDEX_FILENAME) {
    return true;
  }
  return !fileName.startsWith('.') && hasMarkdownExtension(fileName);
}

function uniqueResolvedPaths(paths: readonly string[]): string[] {
  return Array.from(new Set(paths.map((filePath) => path.resolve(filePath))));
}

function isSamePath(leftPath: string, rightPath: string): boolean {
  return isSubpath(leftPath, rightPath) && isSubpath(rightPath, leftPath);
}

function includesSamePath(
  paths: readonly string[],
  targetPath: string,
): boolean {
  return paths.some((candidate) => isSamePath(candidate, targetPath));
}

function isAllowedPrivateMemoryDocumentPath(
  targetPath: string,
  memoryDirs: readonly string[],
): boolean {
  const resolvedTargetPath = path.resolve(targetPath);
  const targetDir = path.dirname(resolvedTargetPath);
  if (!includesSamePath(memoryDirs, targetDir)) {
    return false;
  }
  return isAllowedPrivateMemoryFileName(path.basename(resolvedTargetPath));
}

function isAllowedGlobalMemoryDocumentPath(
  targetPath: string,
  globalMemoryFiles: readonly string[],
): boolean {
  const resolvedTargetPath = path.resolve(targetPath);
  return includesSamePath(globalMemoryFiles, resolvedTargetPath);
}

export async function getMemoryPatchTargetValidationContext(
  config: Config,
  kind: InboxMemoryPatchKind,
): Promise<MemoryPatchTargetValidationContext> {
  const allowedRoots = await canonicalizeAllowedPatchRoots(
    getAllowedMemoryPatchRoots(config, kind),
  );

  if (kind === 'global') {
    const rawGlobalMemoryFile = path.resolve(getGlobalMemoryFilePath());
    const canonicalGlobalMemoryFiles = await canonicalizeAllowedPatchRoots([
      rawGlobalMemoryFile,
    ]);
    return {
      kind,
      allowedRoots,
      privateMemoryDirs: [],
      globalMemoryFiles: uniqueResolvedPaths([
        rawGlobalMemoryFile,
        ...canonicalGlobalMemoryFiles,
      ]),
    };
  }

  const rawPrivateMemoryDir = path.resolve(
    config.storage.getProjectMemoryTempDir(),
  );
  const canonicalPrivateMemoryDirs = await canonicalizeAllowedPatchRoots([
    rawPrivateMemoryDir,
  ]);
  const privateMemoryDirs = uniqueResolvedPaths([
    rawPrivateMemoryDir,
    ...canonicalPrivateMemoryDirs,
  ]);

  return { kind, allowedRoots, privateMemoryDirs, globalMemoryFiles: [] };
}

export function isResolvedMemoryPatchTargetAllowed(
  resolvedTargetPath: string,
  context: MemoryPatchTargetValidationContext,
): boolean {
  if (context.kind === 'global') {
    return isAllowedGlobalMemoryDocumentPath(
      resolvedTargetPath,
      context.globalMemoryFiles,
    );
  }
  if (context.kind === 'private') {
    return isAllowedPrivateMemoryDocumentPath(
      resolvedTargetPath,
      context.privateMemoryDirs,
    );
  }
  return true;
}

export async function resolveMemoryPatchTargetWithinAllowedSet(
  targetPath: string,
  context: MemoryPatchTargetValidationContext,
): Promise<string | undefined> {
  const resolvedTargetPath = await resolveTargetWithinAllowedRoots(
    targetPath,
    context.allowedRoots,
  );
  if (!resolvedTargetPath) {
    return undefined;
  }
  if (
    context.kind === 'private' &&
    (!isAllowedPrivateMemoryDocumentPath(
      targetPath,
      context.privateMemoryDirs,
    ) ||
      !isAllowedPrivateMemoryDocumentPath(
        resolvedTargetPath,
        context.privateMemoryDirs,
      ))
  ) {
    return undefined;
  }
  if (
    context.kind === 'global' &&
    (!isAllowedGlobalMemoryDocumentPath(
      targetPath,
      context.globalMemoryFiles,
    ) ||
      !isAllowedGlobalMemoryDocumentPath(
        resolvedTargetPath,
        context.globalMemoryFiles,
      ))
  ) {
    return undefined;
  }
  return resolvedTargetPath;
}

export async function findDisallowedMemoryPatchTarget(
  parsedPatches: StructuredPatch[],
  context: MemoryPatchTargetValidationContext,
): Promise<string | undefined> {
  const validated = validateParsedSkillPatchHeaders(parsedPatches);
  if (!validated.success) {
    return undefined;
  }

  for (const header of validated.patches) {
    if (
      !(await resolveMemoryPatchTargetWithinAllowedSet(
        header.targetPath,
        context,
      ))
    ) {
      return header.targetPath;
    }
  }
  return undefined;
}

export async function getInboxMemoryPatchSourcePath(
  config: Config,
  kind: InboxMemoryPatchKind,
  relativePath: string,
): Promise<string | undefined> {
  const normalizedPath = normalizeInboxMemoryPatchPath(relativePath);
  if (!normalizedPath) {
    return undefined;
  }

  const patchRoot = path.resolve(
    getMemoryPatchRoot(config.storage.getProjectMemoryTempDir(), kind),
  );
  const sourcePath = path.resolve(patchRoot, ...normalizedPath.split('/'));
  if (!isSubpathOrSame(sourcePath, patchRoot)) {
    return undefined;
  }
  return sourcePath;
}

/**
 * Returns the absolute paths of every `.patch` file currently in the kind's
 * inbox directory (sorted by basename for stable ordering at apply time).
 *
 * NOTE: this is a raw filesystem listing — it does NOT validate patch shape
 * or that targets fall inside the kind's allowed root. Callers that need
 * "what the user actually sees in the inbox" should use `listValidInboxPatchFiles`.
 */
export async function listInboxPatchFiles(
  config: Config,
  kind: InboxMemoryPatchKind,
): Promise<string[]> {
  const patchRoot = getMemoryPatchRoot(
    config.storage.getProjectMemoryTempDir(),
    kind,
  );
  const found: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    let dirEntries: Array<import('node:fs').Dirent>;
    try {
      dirEntries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of dirEntries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.patch')) {
        found.push(entryPath);
      }
    }
  }

  await walk(patchRoot);
  return found.sort();
}

export type ValidateInboxMemoryPatchFileResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Checks whether a memory inbox patch passes the same validation as
 * `/memory inbox`: parseable unified diff, at least one hunk per parsed file,
 * valid absolute headers, and all targets inside the kind's allowed target set.
 */
export async function validateInboxMemoryPatchFile(
  config: Config,
  kind: InboxMemoryPatchKind,
  sourcePath: string,
): Promise<ValidateInboxMemoryPatchFileResult> {
  let content: string;
  try {
    content = await fs.readFile(sourcePath, 'utf-8');
  } catch (error) {
    return {
      valid: false,
      reason: `failed to read patch: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let parsed: StructuredPatch[];
  try {
    parsed = Diff.parsePatch(content);
  } catch (error) {
    return {
      valid: false,
      reason: `failed to parse patch: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!hasParsedPatchHunks(parsed)) {
    return { valid: false, reason: 'no hunks found in patch' };
  }

  const validated = validateParsedSkillPatchHeaders(parsed);
  if (!validated.success) {
    switch (validated.reason) {
      case 'missingTargetPath':
        return {
          valid: false,
          reason: 'missing target file path in patch header',
        };
      case 'invalidPatchHeaders':
        return {
          valid: false,
          reason: `invalid diff headers${validated.targetPath ? `: ${validated.targetPath}` : ''}`,
        };
      default:
        return { valid: false, reason: 'invalid patch headers' };
    }
  }

  const validationContext = await getMemoryPatchTargetValidationContext(
    config,
    kind,
  );
  for (const header of validated.patches) {
    if (
      !(await resolveMemoryPatchTargetWithinAllowedSet(
        header.targetPath,
        validationContext,
      ))
    ) {
      return {
        valid: false,
        reason: `target file is outside ${kind} memory roots: ${header.targetPath}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Returns only the inbox patch files that pass the same validation as the
 * inbox listing (parseable, has hunks, valid headers, targets in the kind's
 * allowed target set). Used by aggregate apply and memory-service notification
 * counting so the user only ever sees results for patches the inbox actually
 * surfaced.
 */
export async function listValidInboxPatchFiles(
  config: Config,
  kind: InboxMemoryPatchKind,
): Promise<string[]> {
  const patchFiles = await listInboxPatchFiles(config, kind);
  if (patchFiles.length === 0) {
    return [];
  }

  const valid: string[] = [];
  for (const sourcePath of patchFiles) {
    const validation = await validateInboxMemoryPatchFile(
      config,
      kind,
      sourcePath,
    );
    if (validation.valid) {
      valid.push(sourcePath);
    }
  }
  return valid;
}

export interface AppliedSkillPatchTarget {
  targetPath: string;
  original: string;
  patched: string;
  isNewFile: boolean;
}

export type ApplyParsedSkillPatchesResult =
  | {
      success: true;
      results: AppliedSkillPatchTarget[];
    }
  | {
      success: false;
      reason:
        | 'missingTargetPath'
        | 'invalidPatchHeaders'
        | 'outsideAllowedRoots'
        | 'newFileAlreadyExists'
        | 'targetNotFound'
        | 'doesNotApply';
      targetPath?: string;
      isNewFile?: boolean;
    };

export async function applyParsedSkillPatches(
  parsedPatches: StructuredPatch[],
  config: Config,
): Promise<ApplyParsedSkillPatchesResult> {
  const allowedRoots = await getCanonicalAllowedSkillPatchRoots(config);
  return applyParsedPatchesWithAllowedRoots(parsedPatches, allowedRoots);
}

export interface ApplyParsedPatchesWithAllowedRootsOptions {
  /**
   * Optional fine-grained allowlist for callers whose allowed root is broader
   * than their actual target surface. Receives the canonical target path after
   * root containment has already passed.
   */
  isResolvedTargetAllowed?: (resolvedTargetPath: string) => boolean;
}

/**
 * Applies parsed unified diff patches against any caller-supplied set of
 * allowed root directories. This is the kind-agnostic core used by both the
 * skill patch flow and the memory patch flow.
 *
 * The patch headers must reference absolute paths inside one of the allowed
 * roots (after canonical resolution) and pass any caller-supplied fine-grained
 * target predicate. Update patches must reference an existing target; creation
 * patches (`/dev/null` source) must reference a path that does not yet exist.
 *
 * Returns the per-target before/after content so callers can stage commits
 * and roll back on failure.
 */
export async function applyParsedPatchesWithAllowedRoots(
  parsedPatches: StructuredPatch[],
  allowedRoots: string[],
  options: ApplyParsedPatchesWithAllowedRootsOptions = {},
): Promise<ApplyParsedSkillPatchesResult> {
  const results = new Map<string, AppliedSkillPatchTarget>();
  const patchedContentByTarget = new Map<string, string>();
  const originalContentByTarget = new Map<string, string>();

  const validatedHeaders = validateParsedSkillPatchHeaders(parsedPatches);
  if (!validatedHeaders.success) {
    return validatedHeaders;
  }

  for (const [index, patch] of parsedPatches.entries()) {
    const { targetPath, isNewFile } = validatedHeaders.patches[index];

    const resolvedTargetPath = await resolveTargetWithinAllowedRoots(
      targetPath,
      allowedRoots,
    );
    if (
      !resolvedTargetPath ||
      (options.isResolvedTargetAllowed &&
        !options.isResolvedTargetAllowed(resolvedTargetPath))
    ) {
      return {
        success: false,
        reason: 'outsideAllowedRoots',
        targetPath,
      };
    }

    let source: string;
    if (patchedContentByTarget.has(resolvedTargetPath)) {
      source = patchedContentByTarget.get(resolvedTargetPath)!;
    } else if (isNewFile) {
      try {
        await fs.lstat(resolvedTargetPath);
        return {
          success: false,
          reason: 'newFileAlreadyExists',
          targetPath,
          isNewFile: true,
        };
      } catch (error) {
        if (
          !isNodeError(error) ||
          (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')
        ) {
          return {
            success: false,
            reason: 'targetNotFound',
            targetPath,
            isNewFile: true,
          };
        }
      }

      source = '';
      originalContentByTarget.set(resolvedTargetPath, source);
    } else {
      try {
        source = await fs.readFile(resolvedTargetPath, 'utf-8');
        originalContentByTarget.set(resolvedTargetPath, source);
      } catch {
        return {
          success: false,
          reason: 'targetNotFound',
          targetPath,
        };
      }
    }

    const applied = Diff.applyPatch(source, patch);
    if (applied === false) {
      return {
        success: false,
        reason: 'doesNotApply',
        targetPath,
        isNewFile: results.get(resolvedTargetPath)?.isNewFile ?? isNewFile,
      };
    }

    patchedContentByTarget.set(resolvedTargetPath, applied);
    results.set(resolvedTargetPath, {
      targetPath: resolvedTargetPath,
      original: originalContentByTarget.get(resolvedTargetPath) ?? '',
      patched: applied,
      isNewFile: results.get(resolvedTargetPath)?.isNewFile ?? isNewFile,
    });
  }

  return {
    success: true,
    results: Array.from(results.values()),
  };
}

/**
 * Canonicalizes a caller-supplied allowed root list once so callers can pass
 * raw `Storage` paths without each call doing realpath traversal.
 */
export async function canonicalizeAllowedPatchRoots(
  roots: string[],
): Promise<string[]> {
  const canonicalRoots = await Promise.all(
    roots.map((root) => resolvePathWithExistingAncestors(root)),
  );
  return Array.from(
    new Set(
      canonicalRoots.filter((root): root is string => typeof root === 'string'),
    ),
  );
}

/**
 * Returns the canonical target path if it falls inside (or exactly equals)
 * one of the supplied allowed roots, otherwise `undefined`. Allowed roots may
 * be either directories (subtree allowlist) or single file paths
 * (single-file allowlist) — `isSubpath(file, file)` returns true for the
 * same-path case.
 *
 * Exported so that `listInboxMemoryPatches` can pre-filter patches whose
 * headers escape the kind's allowed root, instead of surfacing them in the
 * UI just to fail at Apply time.
 */
export async function resolveTargetWithinAllowedRoots(
  targetPath: string,
  allowedRoots: string[],
): Promise<string | undefined> {
  const canonicalTargetPath =
    await resolvePathWithExistingAncestors(targetPath);
  if (!canonicalTargetPath) {
    return undefined;
  }
  if (allowedRoots.some((root) => isSubpath(root, canonicalTargetPath))) {
    return canonicalTargetPath;
  }
  return undefined;
}
