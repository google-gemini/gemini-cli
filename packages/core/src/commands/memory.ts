/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as Diff from 'diff';
import type { Config } from '../config/config.js';
import { Storage } from '../config/storage.js';
import { flattenMemory } from '../config/memory.js';
import { loadSkillFromFile, loadSkillsFromDir } from '../skills/skillLoader.js';
import { getGlobalMemoryFilePath } from '../tools/memoryTool.js';
import {
  type AppliedSkillPatchTarget,
  applyParsedPatchesWithAllowedRoots,
  applyParsedSkillPatches,
  canonicalizeAllowedPatchRoots,
  hasParsedPatchHunks,
  isProjectSkillPatchTarget,
  resolveTargetWithinAllowedRoots,
  validateParsedSkillPatchHeaders,
} from '../services/memoryPatchUtils.js';
import { readExtractionState } from '../services/memoryService.js';
import { refreshServerHierarchicalMemory } from '../utils/memoryDiscovery.js';
import type { MessageActionReturn, ToolActionReturn } from './types.js';

export function showMemory(config: Config): MessageActionReturn {
  const memoryContent = flattenMemory(config.getUserMemory());
  const fileCount = config.getGeminiMdFileCount() || 0;
  let content: string;

  if (memoryContent.length > 0) {
    content = `Current memory content from ${fileCount} file(s):\n\n---\n${memoryContent}\n---`;
  } else {
    content = 'Memory is currently empty.';
  }

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}

export function addMemory(
  args?: string,
): MessageActionReturn | ToolActionReturn {
  if (!args || args.trim() === '') {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Usage: /memory add <text to remember>',
    };
  }
  return {
    type: 'tool',
    toolName: 'save_memory',
    toolArgs: { fact: args.trim() },
  };
}

export async function refreshMemory(
  config: Config,
): Promise<MessageActionReturn> {
  let memoryContent = '';
  let fileCount = 0;

  if (config.isJitContextEnabled()) {
    await config.getMemoryContextManager()?.refresh();
    memoryContent = flattenMemory(config.getUserMemory());
    fileCount = config.getGeminiMdFileCount();
  } else {
    const result = await refreshServerHierarchicalMemory(config);
    memoryContent = flattenMemory(result.memoryContent);
    fileCount = result.fileCount;
  }

  config.updateSystemInstructionIfInitialized();
  let content: string;

  if (memoryContent.length > 0) {
    content = `Memory reloaded successfully. Loaded ${memoryContent.length} characters from ${fileCount} file(s)`;
  } else {
    content = 'Memory reloaded successfully. No memory content found';
  }

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}

export function listMemoryFiles(config: Config): MessageActionReturn {
  const filePaths = config.getGeminiMdFilePaths() || [];
  const fileCount = filePaths.length;
  let content: string;

  if (fileCount > 0) {
    content = `There are ${fileCount} GEMINI.md file(s) in use:\n\n${filePaths.join(
      '\n',
    )}`;
  } else {
    content = 'No GEMINI.md files in use.';
  }

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}

/**
 * Represents a skill found in the extraction inbox.
 */
export interface InboxSkill {
  /** Directory name in the inbox. */
  dirName: string;
  /** Skill name from SKILL.md frontmatter. */
  name: string;
  /** Skill description from SKILL.md frontmatter. */
  description: string;
  /** Raw SKILL.md content for preview. */
  content: string;
  /** When the skill was extracted (ISO string), if known. */
  extractedAt?: string;
}

/**
 * Scans the skill extraction inbox and returns structured data
 * for each extracted skill.
 */
export async function listInboxSkills(config: Config): Promise<InboxSkill[]> {
  const skillsDir = config.storage.getProjectSkillsMemoryDir();

  let entries: Array<import('node:fs').Dirent>;
  try {
    entries = await fs.readdir(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length === 0) {
    return [];
  }

  // Load extraction state to get dates
  const memoryDir = config.storage.getProjectMemoryTempDir();
  const statePath = path.join(memoryDir, '.extraction-state.json');
  const state = await readExtractionState(statePath);

  // Build a map: skillDirName → extractedAt
  const skillDateMap = new Map<string, string>();
  for (const run of state.runs) {
    for (const skillName of run.skillsCreated) {
      skillDateMap.set(skillName, run.runAt);
    }
  }

  const skills: InboxSkill[] = [];
  for (const dir of dirs) {
    const skillPath = path.join(skillsDir, dir.name, 'SKILL.md');
    const skillDef = await loadSkillFromFile(skillPath);
    if (!skillDef) continue;

    let content = '';
    try {
      content = await fs.readFile(skillPath, 'utf-8');
    } catch {
      // Best-effort — preview will be empty
    }

    skills.push({
      dirName: dir.name,
      name: skillDef.name,
      description: skillDef.description,
      content,
      extractedAt: skillDateMap.get(dir.name),
    });
  }

  return skills;
}

export type InboxSkillDestination = 'global' | 'project';

function isValidInboxSkillDirName(dirName: string): boolean {
  return (
    dirName.length > 0 &&
    dirName !== '.' &&
    dirName !== '..' &&
    !dirName.includes('/') &&
    !dirName.includes('\\')
  );
}

function isValidInboxPatchFileName(fileName: string): boolean {
  return (
    fileName.length > 0 &&
    fileName !== '.' &&
    fileName !== '..' &&
    !fileName.includes('/') &&
    !fileName.includes('\\')
  );
}

async function getSkillNameForConflictCheck(
  skillDir: string,
  fallbackName: string,
): Promise<string> {
  const skill = await loadSkillFromFile(path.join(skillDir, 'SKILL.md'));
  return skill?.name ?? fallbackName;
}

/**
 * Copies an inbox skill to the target skills directory.
 */
export async function moveInboxSkill(
  config: Config,
  dirName: string,
  destination: InboxSkillDestination,
): Promise<{ success: boolean; message: string }> {
  if (!isValidInboxSkillDirName(dirName)) {
    return {
      success: false,
      message: 'Invalid skill name.',
    };
  }

  const skillsDir = config.storage.getProjectSkillsMemoryDir();
  const sourcePath = path.join(skillsDir, dirName);

  try {
    await fs.access(sourcePath);
  } catch {
    return {
      success: false,
      message: `Skill "${dirName}" not found in inbox.`,
    };
  }

  const targetBase =
    destination === 'global'
      ? Storage.getUserSkillsDir()
      : config.storage.getProjectSkillsDir();
  const targetPath = path.join(targetBase, dirName);
  const skillName = await getSkillNameForConflictCheck(sourcePath, dirName);

  try {
    await fs.access(targetPath);
    return {
      success: false,
      message: `A skill named "${skillName}" already exists in ${destination} skills.`,
    };
  } catch {
    // Target doesn't exist — good
  }

  const existingTargetSkills = await loadSkillsFromDir(targetBase);
  if (existingTargetSkills.some((skill) => skill.name === skillName)) {
    return {
      success: false,
      message: `A skill named "${skillName}" already exists in ${destination} skills.`,
    };
  }

  await fs.mkdir(targetBase, { recursive: true });
  await fs.cp(sourcePath, targetPath, { recursive: true });

  // Remove from inbox after successful copy
  await fs.rm(sourcePath, { recursive: true, force: true });

  const label =
    destination === 'global' ? '~/.gemini/skills' : '.gemini/skills';
  return {
    success: true,
    message: `Moved "${dirName}" to ${label}.`,
  };
}

/**
 * Removes a skill from the extraction inbox.
 */
export async function dismissInboxSkill(
  config: Config,
  dirName: string,
): Promise<{ success: boolean; message: string }> {
  if (!isValidInboxSkillDirName(dirName)) {
    return {
      success: false,
      message: 'Invalid skill name.',
    };
  }

  const skillsDir = config.storage.getProjectSkillsMemoryDir();
  const sourcePath = path.join(skillsDir, dirName);

  try {
    await fs.access(sourcePath);
  } catch {
    return {
      success: false,
      message: `Skill "${dirName}" not found in inbox.`,
    };
  }

  await fs.rm(sourcePath, { recursive: true, force: true });

  return {
    success: true,
    message: `Dismissed "${dirName}" from inbox.`,
  };
}

/**
 * A parsed patch entry from a unified diff, representing changes to a single file.
 */
export interface InboxPatchEntry {
  /** Absolute path to the target file (or '/dev/null' for new files). */
  targetPath: string;
  /** The unified diff text for this single file. */
  diffContent: string;
}

/**
 * Represents a .patch file found in the extraction inbox.
 */
export interface InboxPatch {
  /** The .patch filename (e.g. "update-docs-writer.patch"). */
  fileName: string;
  /** Display name (filename without .patch extension). */
  name: string;
  /** Per-file entries parsed from the patch. */
  entries: InboxPatchEntry[];
  /** When the patch was extracted (ISO string), if known. */
  extractedAt?: string;
}

export type InboxMemoryPatchKind = 'private' | 'global';

/**
 * One target file inside a memory patch (most patches will have a single entry).
 */
export interface InboxMemoryPatchEntry {
  /** Absolute path of the markdown file the patch will modify. */
  targetPath: string;
  /** Unified diff for this single file (used for UI preview). */
  diffContent: string;
  /** True when this entry creates a new file (`/dev/null` source). */
  isNewFile: boolean;
}

/**
 * Represents the AGGREGATED inbox state for one memory kind. Even when the
 * extraction agent has produced multiple `.patch` files under
 * `<memoryDir>/.inbox/<kind>/` (e.g. across several sessions), the inbox
 * surfaces them as ONE entry per kind. Apply runs each underlying patch in
 * sequence; Dismiss removes them all.
 */
export interface InboxMemoryPatch {
  /** Memory tier — one entry per kind in the inbox. */
  kind: InboxMemoryPatchKind;
  /**
   * Stable identifier for this consolidated entry. Set to the kind itself
   * (`"private"` or `"global"`); kept in the type for backwards-compat with
   * the per-file API the dialog passes through.
   */
  relativePath: string;
  /** Display name shown in the inbox row (e.g. `"Private memory"`). */
  name: string;
  /** All hunks from all underlying source patches, concatenated in order. */
  entries: InboxMemoryPatchEntry[];
  /** Basenames of the underlying `.patch` files being aggregated. */
  sourceFiles: string[];
  /** Most recent mtime across the source files (ISO string), if known. */
  extractedAt?: string;
}

interface StagedInboxPatchTarget {
  targetPath: string;
  tempPath: string;
  original: string;
  isNewFile: boolean;
  mode?: number;
}

/**
 * Reconstructs a unified diff string for a single ParsedDiff entry.
 */
function formatParsedDiff(parsed: Diff.StructuredPatch): string {
  const lines: string[] = [];
  if (parsed.oldFileName) {
    lines.push(`--- ${parsed.oldFileName}`);
  }
  if (parsed.newFileName) {
    lines.push(`+++ ${parsed.newFileName}`);
  }
  for (const hunk of parsed.hunks) {
    lines.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    );
    for (const line of hunk.lines) {
      lines.push(line);
    }
  }
  return lines.join('\n');
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getMemoryPatchRoot(
  memoryDir: string,
  kind: InboxMemoryPatchKind,
): string {
  return path.join(memoryDir, '.inbox', kind);
}

function isSubpathOrSame(childPath: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

function normalizeInboxMemoryPatchPath(
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
 * Returns the directory roots (or single-file allowlists) that a memory patch
 * of the given kind is allowed to modify. Memory patch headers must reference
 * paths inside / equal to one of these entries after canonical resolution.
 *
 * - `private` allows any markdown file inside the project memory directory.
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

async function getFileMtimeIso(filePath: string): Promise<string | undefined> {
  try {
    const stats = await fs.stat(filePath);
    return stats.mtime.toISOString();
  } catch {
    return undefined;
  }
}

async function getInboxMemoryPatchSourcePath(
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

async function patchTargetsProjectSkills(
  targetPaths: string[],
  config: Config,
) {
  for (const targetPath of targetPaths) {
    if (await isProjectSkillPatchTarget(targetPath, config)) {
      return true;
    }
  }
  return false;
}

async function getPatchExtractedAt(
  patchPath: string,
): Promise<string | undefined> {
  try {
    const stats = await fs.stat(patchPath);
    return stats.mtime.toISOString();
  } catch {
    return undefined;
  }
}

function formatMemoryKindLabel(kind: InboxMemoryPatchKind): string {
  switch (kind) {
    case 'private':
      return 'Private memory';
    case 'global':
      return 'Global memory';
    default:
      return kind;
  }
}

/**
 * Returns the absolute paths of every `.patch` file currently in the kind's
 * inbox directory (sorted by basename for stable ordering at apply time).
 *
 * NOTE: this is a raw filesystem listing — it does NOT validate patch shape
 * or that targets fall inside the kind's allowed root. Callers that need
 * "what the user actually sees in the inbox" should use `listValidInboxPatchFiles`.
 */
async function listInboxPatchFiles(
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

/**
 * Returns only the inbox patch files that pass the same validation as the
 * inbox listing (parseable, has hunks, valid headers, targets in the
 * kind's allowed root). Used by aggregate apply so the user only ever sees
 * results for patches the inbox actually surfaced.
 */
async function listValidInboxPatchFiles(
  config: Config,
  kind: InboxMemoryPatchKind,
): Promise<string[]> {
  const patchFiles = await listInboxPatchFiles(config, kind);
  if (patchFiles.length === 0) {
    return [];
  }

  const allowedRoots = await canonicalizeAllowedPatchRoots(
    getAllowedMemoryPatchRoots(config, kind),
  );

  const valid: string[] = [];
  for (const sourcePath of patchFiles) {
    let content: string;
    try {
      content = await fs.readFile(sourcePath, 'utf-8');
    } catch {
      continue;
    }

    let parsed: Diff.StructuredPatch[];
    try {
      parsed = Diff.parsePatch(content);
    } catch {
      continue;
    }
    if (!hasParsedPatchHunks(parsed)) {
      continue;
    }

    const validated = validateParsedSkillPatchHeaders(parsed);
    if (!validated.success) {
      continue;
    }

    const targetsAllAllowed = await Promise.all(
      validated.patches.map(
        async (header) =>
          (await resolveTargetWithinAllowedRoots(
            header.targetPath,
            allowedRoots,
          )) !== undefined,
      ),
    );
    if (!targetsAllAllowed.every(Boolean)) {
      continue;
    }

    valid.push(sourcePath);
  }
  return valid;
}

/**
 * Scans `<memoryDir>/.inbox/{private,global}/` and returns ONE consolidated
 * inbox entry per kind. Each entry aggregates all hunks from every valid
 * underlying `.patch` file. Patches that fail validation (unparseable, no
 * hunks, target outside allowed root) are silently skipped so they don't
 * pollute the inbox UI.
 */
export async function listInboxMemoryPatches(
  config: Config,
): Promise<InboxMemoryPatch[]> {
  const kinds: InboxMemoryPatchKind[] = ['private', 'global'];
  const aggregated: InboxMemoryPatch[] = [];

  for (const kind of kinds) {
    const allowedRoots = await canonicalizeAllowedPatchRoots(
      getAllowedMemoryPatchRoots(config, kind),
    );
    const patchFiles = await listInboxPatchFiles(config, kind);

    const aggregatedEntries: InboxMemoryPatchEntry[] = [];
    const sourceFiles: string[] = [];
    let latestMtime: string | undefined;

    for (const sourcePath of patchFiles) {
      let content: string;
      try {
        content = await fs.readFile(sourcePath, 'utf-8');
      } catch {
        continue;
      }

      let parsed: Diff.StructuredPatch[];
      try {
        parsed = Diff.parsePatch(content);
      } catch {
        continue;
      }
      if (!hasParsedPatchHunks(parsed)) {
        continue;
      }

      const validated = validateParsedSkillPatchHeaders(parsed);
      if (!validated.success) {
        continue;
      }

      // Skip the entire source file if ANY of its targets escapes the kind's
      // allowed root.
      const targetsAllAllowed = await Promise.all(
        validated.patches.map(
          async (header) =>
            (await resolveTargetWithinAllowedRoots(
              header.targetPath,
              allowedRoots,
            )) !== undefined,
        ),
      );
      if (!targetsAllAllowed.every(Boolean)) {
        continue;
      }

      for (const [index, header] of validated.patches.entries()) {
        aggregatedEntries.push({
          targetPath: header.targetPath,
          isNewFile: header.isNewFile,
          diffContent: formatParsedDiff(parsed[index]),
        });
      }

      sourceFiles.push(path.basename(sourcePath));

      const mtime = await getFileMtimeIso(sourcePath);
      if (mtime && (!latestMtime || mtime > latestMtime)) {
        latestMtime = mtime;
      }
    }

    if (aggregatedEntries.length === 0) {
      continue;
    }

    aggregated.push({
      kind,
      relativePath: kind,
      name: formatMemoryKindLabel(kind),
      entries: aggregatedEntries,
      sourceFiles,
      extractedAt: latestMtime,
    });
  }

  return aggregated;
}

/**
 * Applies an inbox memory patch atomically and removes the patch on success.
 *
 * Process:
 *   1. Parse + validate the patch headers (absolute paths only, no `a/`/`b/`).
 *   2. Dry-run the patch against the current target content (or empty for
 *      `/dev/null` creation patches).
 *   3. Stage the patched content to a temp file, then rename into place.
 *   4. On any failure, restore previous content from the staged snapshot and
 *      leave the inbox patch intact for retry.
 */
/**
 * Applies one inbox memory entry. Two modes:
 *   - Aggregate mode (`relativePath === kind`): walk every `.patch` file in
 *     the kind's inbox directory and apply each one in lexical order. Each
 *     file is its own atomic transaction; failures don't block subsequent
 *     successes. Returns an aggregated summary (e.g. "Applied 3 of 4 sub-
 *     patches; 1 failed: …").
 *   - Single-file mode (legacy): `relativePath` points at a specific
 *     `.patch` filename. Used by tests and direct callers.
 */
export async function applyInboxMemoryPatch(
  config: Config,
  kind: InboxMemoryPatchKind,
  relativePath: string,
): Promise<{ success: boolean; message: string }> {
  if (relativePath === kind) {
    return applyAllInboxPatchesForKind(config, kind);
  }

  const normalizedPath = normalizeInboxMemoryPatchPath(relativePath);
  if (!normalizedPath) {
    return { success: false, message: 'Invalid memory patch path.' };
  }

  const sourcePath = await getInboxMemoryPatchSourcePath(
    config,
    kind,
    normalizedPath,
  );
  if (!sourcePath) {
    return { success: false, message: 'Invalid memory patch path.' };
  }

  return applyMemoryPatchFile(config, kind, sourcePath, normalizedPath);
}

async function applyAllInboxPatchesForKind(
  config: Config,
  kind: InboxMemoryPatchKind,
): Promise<{ success: boolean; message: string }> {
  // Only attempt patches the user actually saw in the inbox listing.
  // Files that were filtered (bad headers, escape allowed root, etc.) stay
  // on disk untouched.
  const patchFiles = await listValidInboxPatchFiles(config, kind);
  if (patchFiles.length === 0) {
    return {
      success: false,
      message: `No ${kind} memory patches in inbox.`,
    };
  }

  const successes: string[] = [];
  const failures: Array<{ name: string; reason: string }> = [];
  let pointersAddedAcrossPatches: string[] = [];

  for (const sourcePath of patchFiles) {
    const basename = path.basename(sourcePath);
    const result = await applyMemoryPatchFile(
      config,
      kind,
      sourcePath,
      basename,
    );
    if (result.success) {
      successes.push(basename);
      // Surface auto-added MEMORY.md pointer info if present.
      const pointerMatch = result.message.match(
        /Auto-added MEMORY\.md pointer for ([^.]+)\./,
      );
      if (pointerMatch) {
        pointersAddedAcrossPatches.push(pointerMatch[1]);
      }
    } else {
      failures.push({ name: basename, reason: result.message });
    }
  }

  // De-dup pointer notes (same sibling could have been mentioned twice).
  pointersAddedAcrossPatches = Array.from(new Set(pointersAddedAcrossPatches));

  const total = successes.length + failures.length;
  if (failures.length === 0) {
    const pointerNote =
      pointersAddedAcrossPatches.length > 0
        ? ` Auto-added MEMORY.md pointer(s) for ${pointersAddedAcrossPatches.join('; ')}.`
        : '';
    return {
      success: true,
      message: `Applied all ${successes.length} ${kind} memory patch${
        successes.length === 1 ? '' : 'es'
      }.${pointerNote}`,
    };
  }

  const failureSummary = failures
    .map((f) => `"${f.name}" — ${f.reason}`)
    .join('; ');
  // Any failure → success=false so the dialog keeps the inbox entry visible
  // (the user needs to see and retry/dismiss the remaining sub-patches).
  // The successful sub-patches have already been removed from disk by
  // applyMemoryPatchFile, so the next listing will show only the failures.
  return {
    success: false,
    message:
      `Applied ${successes.length} of ${total} ${kind} memory patches. ` +
      `${failures.length} failed: ${failureSummary}`,
  };
}

async function canonicalizeDirIfPresent(dirPath: string): Promise<string> {
  try {
    return await fs.realpath(dirPath);
  } catch {
    return path.resolve(dirPath);
  }
}

/**
 * Returns the basenames of any sibling .md files (not MEMORY.md itself) that
 * are being CREATED by this patch under `<memoryDir>/` directly.
 */
function findSiblingCreations(
  appliedResults: readonly AppliedSkillPatchTarget[],
  memoryDir: string,
): AppliedSkillPatchTarget[] {
  return appliedResults.filter((entry) => {
    if (!entry.isNewFile) return false;
    const targetDir = path.dirname(path.resolve(entry.targetPath));
    if (targetDir !== memoryDir) return false;
    const basename = path.basename(entry.targetPath);
    if (basename.toLowerCase() === 'memory.md') return false;
    return basename.toLowerCase().endsWith('.md');
  });
}

interface AutoPointerAugmentation {
  /** Patch results, possibly with a synthesized/extended MEMORY.md entry. */
  results: AppliedSkillPatchTarget[];
  /** Sibling basenames a pointer was auto-added for (empty if none). */
  pointersAdded: string[];
}

/**
 * MEMORY.md is the index that gets injected into future agent contexts.
 * Sibling .md files in `<memoryDir>/` are loaded ON DEMAND by the runtime
 * agent via `read_file` — but only IF MEMORY.md references them by name
 * (see `getUserProjectMemoryPaths`).
 *
 * If a private patch creates a sibling without also referencing it from
 * MEMORY.md, the new file would never be discoverable. Rather than rejecting
 * the patch (bad UX), we auto-bundle a MEMORY.md update that adds a
 * one-line pointer per orphan sibling. The augmented entry is then committed
 * atomically alongside the rest of the patch.
 *
 * If the patch already updates/creates MEMORY.md and the new content already
 * references the sibling, no augmentation is needed.
 */
async function augmentWithAutoPointers(
  config: Config,
  appliedResults: readonly AppliedSkillPatchTarget[],
): Promise<AutoPointerAugmentation> {
  const memoryDir = await canonicalizeDirIfPresent(
    config.storage.getProjectMemoryTempDir(),
  );
  const memoryMdPath = path.join(memoryDir, 'MEMORY.md');

  const siblingCreations = findSiblingCreations(appliedResults, memoryDir);
  if (siblingCreations.length === 0) {
    return { results: [...appliedResults], pointersAdded: [] };
  }

  // Locate (or initialize) the MEMORY.md entry we'll mutate.
  const existingIdx = appliedResults.findIndex(
    (entry) => path.resolve(entry.targetPath) === memoryMdPath,
  );
  let memoryEntry: AppliedSkillPatchTarget;
  if (existingIdx >= 0) {
    memoryEntry = { ...appliedResults[existingIdx] };
  } else {
    let originalContent = '';
    let isNewFile = true;
    try {
      originalContent = await fs.readFile(memoryMdPath, 'utf-8');
      isNewFile = false;
    } catch {
      // MEMORY.md doesn't exist yet — we'll create it with a default heading.
    }
    memoryEntry = {
      targetPath: memoryMdPath,
      original: originalContent,
      patched: isNewFile ? '# Project Memory\n' : originalContent,
      isNewFile,
    };
  }

  const pointersAdded: string[] = [];
  for (const sibling of siblingCreations) {
    const basename = path.basename(sibling.targetPath);
    // Resolve to absolute path so the runtime agent can `read_file` the
    // sibling directly without needing to know <memoryDir>.
    const absoluteTarget = path.resolve(sibling.targetPath);
    // Existing reference can be by either basename or absolute path; both count.
    if (
      memoryEntry.patched.includes(basename) ||
      memoryEntry.patched.includes(absoluteTarget)
    ) {
      continue; // Already referenced.
    }
    const stem = basename.replace(/\.md$/i, '').replace(/[-_]/g, ' ').trim();
    const pointer = `- See ${absoluteTarget} for ${stem || basename} notes.`;
    memoryEntry.patched = memoryEntry.patched.endsWith('\n')
      ? `${memoryEntry.patched}${pointer}\n`
      : `${memoryEntry.patched}\n${pointer}\n`;
    pointersAdded.push(basename);
  }

  if (pointersAdded.length === 0) {
    return { results: [...appliedResults], pointersAdded: [] };
  }

  const results = [...appliedResults];
  if (existingIdx >= 0) {
    results[existingIdx] = memoryEntry;
  } else {
    results.push(memoryEntry);
  }
  return { results, pointersAdded };
}

/**
 * Internal helper: parses, validates, and atomically commits a memory patch
 * file at a known absolute path. Separated from `applyInboxMemoryPatch` so the
 * path-resolution and patch-apply concerns stay testable independently.
 */
async function applyMemoryPatchFile(
  config: Config,
  kind: InboxMemoryPatchKind,
  patchPath: string,
  displayName: string,
): Promise<{ success: boolean; message: string }> {
  let content: string;
  try {
    content = await fs.readFile(patchPath, 'utf-8');
  } catch {
    return {
      success: false,
      message: `Memory patch "${displayName}" not found in inbox.`,
    };
  }

  let parsed: Diff.StructuredPatch[];
  try {
    parsed = Diff.parsePatch(content);
  } catch (error) {
    return {
      success: false,
      message: `Failed to parse memory patch "${displayName}": ${getErrorMessage(error)}`,
    };
  }
  if (!hasParsedPatchHunks(parsed)) {
    return {
      success: false,
      message: `Memory patch "${displayName}" contains no valid hunks.`,
    };
  }

  const allowedRoots = await canonicalizeAllowedPatchRoots(
    getAllowedMemoryPatchRoots(config, kind),
  );
  const applied = await applyParsedPatchesWithAllowedRoots(
    parsed,
    allowedRoots,
  );
  if (!applied.success) {
    switch (applied.reason) {
      case 'missingTargetPath':
        return {
          success: false,
          message: `Memory patch "${displayName}" is missing a target file path.`,
        };
      case 'invalidPatchHeaders':
        return {
          success: false,
          message: `Memory patch "${displayName}" has invalid diff headers.`,
        };
      case 'outsideAllowedRoots':
        return {
          success: false,
          message: `Memory patch "${displayName}" targets a file outside the ${kind} memory root: ${applied.targetPath}`,
        };
      case 'newFileAlreadyExists':
        return {
          success: false,
          message: `Memory patch "${displayName}" declares a new file, but the target already exists: ${applied.targetPath}`,
        };
      case 'targetNotFound':
        return {
          success: false,
          message: `Target file not found: ${applied.targetPath}`,
        };
      case 'doesNotApply':
        return {
          success: false,
          message: applied.isNewFile
            ? `Memory patch "${displayName}" failed to apply for new file ${applied.targetPath}.`
            : `Memory patch does not apply cleanly to ${applied.targetPath}.`,
        };
      default:
        return {
          success: false,
          message: `Memory patch "${displayName}" could not be applied.`,
        };
    }
  }

  // Auto-bundle a MEMORY.md pointer for any sibling .md the patch creates
  // without referencing it from MEMORY.md. Without that pointer the new file
  // would never be loaded into a future session (see augmentWithAutoPointers).
  let pointersAdded: string[] = [];
  let resultsToCommit: AppliedSkillPatchTarget[] = [...applied.results];
  if (kind === 'private') {
    const augmented = await augmentWithAutoPointers(config, applied.results);
    resultsToCommit = augmented.results;
    pointersAdded = augmented.pointersAdded;
  }

  let stagedTargets: StagedInboxPatchTarget[];
  try {
    stagedTargets = await stageInboxPatchTargets(resultsToCommit);
  } catch (error) {
    return {
      success: false,
      message: `Memory patch "${displayName}" could not be staged: ${getErrorMessage(error)}.`,
    };
  }

  const committedTargets: StagedInboxPatchTarget[] = [];
  try {
    for (const stagedTarget of stagedTargets) {
      await fs.rename(stagedTarget.tempPath, stagedTarget.targetPath);
      committedTargets.push(stagedTarget);
    }
  } catch (error) {
    for (const committedTarget of committedTargets.reverse()) {
      try {
        await restoreCommittedInboxPatchTarget(committedTarget);
      } catch {
        // Best-effort rollback. We still report the commit failure below.
      }
    }
    await cleanupStagedInboxPatchTargets(
      stagedTargets.filter((target) => !committedTargets.includes(target)),
    );
    return {
      success: false,
      message: `Memory patch "${displayName}" could not be applied atomically: ${getErrorMessage(error)}.`,
    };
  }

  await fs.unlink(patchPath);

  const fileCount = resultsToCommit.length;
  const baseMessage = `Applied memory patch to ${fileCount} file${fileCount !== 1 ? 's' : ''}.`;
  const pointerNote =
    pointersAdded.length > 0
      ? ` Auto-added MEMORY.md pointer for ${pointersAdded
          .map((name) => `"${name}"`)
          .join(', ')} so the new sibling file is discoverable.`
      : '';
  return {
    success: true,
    message: `${baseMessage}${pointerNote}`,
  };
}

/**
 * Removes inbox memory patch(es) without applying. Two modes:
 *   - Aggregate (`relativePath === kind`): unlink every `.patch` file in the
 *     kind's inbox directory. Used by the consolidated inbox UI's Dismiss.
 *   - Single-file (legacy): unlink one specific `.patch` file.
 */
export async function dismissInboxMemoryPatch(
  config: Config,
  kind: InboxMemoryPatchKind,
  relativePath: string,
): Promise<{ success: boolean; message: string }> {
  if (relativePath === kind) {
    // Dismiss the same set of files the listing surfaced — leave the
    // already-filtered (bad-target, malformed) files alone for forensic
    // inspection.
    const patchFiles = await listValidInboxPatchFiles(config, kind);
    if (patchFiles.length === 0) {
      return {
        success: false,
        message: `No ${kind} memory patches in inbox.`,
      };
    }
    let removed = 0;
    for (const sourcePath of patchFiles) {
      try {
        await fs.unlink(sourcePath);
        removed += 1;
      } catch {
        // Best-effort: keep going if one delete fails.
      }
    }
    return {
      success: removed > 0,
      message: `Dismissed ${removed} ${kind} memory patch${
        removed === 1 ? '' : 'es'
      } from inbox.`,
    };
  }

  const normalizedPath = normalizeInboxMemoryPatchPath(relativePath);
  if (!normalizedPath) {
    return { success: false, message: 'Invalid memory patch path.' };
  }

  const sourcePath = await getInboxMemoryPatchSourcePath(
    config,
    kind,
    normalizedPath,
  );
  if (!sourcePath) {
    return { success: false, message: 'Invalid memory patch path.' };
  }

  try {
    await fs.access(sourcePath);
  } catch {
    return {
      success: false,
      message: `Memory patch "${normalizedPath}" not found in inbox.`,
    };
  }

  await fs.unlink(sourcePath);

  return {
    success: true,
    message: `Dismissed "${normalizedPath}" from inbox.`,
  };
}

async function findNearestExistingDirectory(
  startPath: string,
): Promise<string> {
  let currentPath = path.resolve(startPath);

  while (true) {
    try {
      const stats = await fs.stat(currentPath);
      if (stats.isDirectory()) {
        return currentPath;
      }
    } catch {
      // Keep walking upward until we find an existing directory.
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return currentPath;
    }
    currentPath = parentPath;
  }
}

async function writeExclusiveFile(
  filePath: string,
  content: string,
  mode?: number,
): Promise<void> {
  const handle = await fs.open(filePath, 'wx');
  try {
    await handle.writeFile(content, 'utf-8');
  } finally {
    await handle.close();
  }

  if (mode !== undefined) {
    await fs.chmod(filePath, mode);
  }
}

async function cleanupStagedInboxPatchTargets(
  stagedTargets: StagedInboxPatchTarget[],
): Promise<void> {
  await Promise.allSettled(
    stagedTargets.map(async ({ tempPath }) => {
      try {
        await fs.unlink(tempPath);
      } catch {
        // Best-effort cleanup.
      }
    }),
  );
}

async function restoreCommittedInboxPatchTarget(
  stagedTarget: StagedInboxPatchTarget,
): Promise<void> {
  if (stagedTarget.isNewFile) {
    try {
      await fs.unlink(stagedTarget.targetPath);
    } catch {
      // Best-effort rollback.
    }
    return;
  }

  const restoreDir = await findNearestExistingDirectory(
    path.dirname(stagedTarget.targetPath),
  );
  const restorePath = path.join(
    restoreDir,
    `.${path.basename(stagedTarget.targetPath)}.${randomUUID()}.rollback`,
  );

  await writeExclusiveFile(
    restorePath,
    stagedTarget.original,
    stagedTarget.mode,
  );
  await fs.rename(restorePath, stagedTarget.targetPath);
}

async function stageInboxPatchTargets(
  targets: AppliedSkillPatchTarget[],
): Promise<StagedInboxPatchTarget[]> {
  const stagedTargets: StagedInboxPatchTarget[] = [];

  try {
    for (const target of targets) {
      let mode: number | undefined;
      if (!target.isNewFile) {
        await fs.access(target.targetPath, fsConstants.W_OK);
        mode = (await fs.stat(target.targetPath)).mode;
      }

      const tempDir = await findNearestExistingDirectory(
        path.dirname(target.targetPath),
      );
      const tempPath = path.join(
        tempDir,
        `.${path.basename(target.targetPath)}.${randomUUID()}.patch-tmp`,
      );

      await writeExclusiveFile(tempPath, target.patched, mode);
      stagedTargets.push({
        targetPath: target.targetPath,
        tempPath,
        original: target.original,
        isNewFile: target.isNewFile,
        mode,
      });
    }

    for (const target of stagedTargets) {
      if (!target.isNewFile) {
        continue;
      }
      await fs.mkdir(path.dirname(target.targetPath), { recursive: true });
    }

    return stagedTargets;
  } catch (error) {
    await cleanupStagedInboxPatchTargets(stagedTargets);
    throw error;
  }
}

/**
 * Scans the skill extraction inbox for .patch files and returns
 * structured data for each valid patch.
 */
export async function listInboxPatches(config: Config): Promise<InboxPatch[]> {
  const skillsDir = config.storage.getProjectSkillsMemoryDir();

  let entries: string[];
  try {
    entries = await fs.readdir(skillsDir);
  } catch {
    return [];
  }

  const patchFiles = entries.filter((e) => e.endsWith('.patch'));
  if (patchFiles.length === 0) {
    return [];
  }

  const patches: InboxPatch[] = [];
  for (const patchFile of patchFiles) {
    const patchPath = path.join(skillsDir, patchFile);
    try {
      const content = await fs.readFile(patchPath, 'utf-8');
      const parsed = Diff.parsePatch(content);
      if (!hasParsedPatchHunks(parsed)) continue;

      const patchEntries: InboxPatchEntry[] = parsed.map((p) => ({
        targetPath: p.newFileName ?? p.oldFileName ?? '',
        diffContent: formatParsedDiff(p),
      }));

      patches.push({
        fileName: patchFile,
        name: patchFile.replace(/\.patch$/, ''),
        entries: patchEntries,
        extractedAt: await getPatchExtractedAt(patchPath),
      });
    } catch {
      // Skip unreadable patch files
    }
  }

  return patches;
}

/**
 * Applies a .patch file from the inbox by reading each target file,
 * applying the diff, and writing the result. Deletes the patch on success.
 */
export async function applyInboxPatch(
  config: Config,
  fileName: string,
): Promise<{ success: boolean; message: string }> {
  if (!isValidInboxPatchFileName(fileName)) {
    return {
      success: false,
      message: 'Invalid patch file name.',
    };
  }

  const skillsDir = config.storage.getProjectSkillsMemoryDir();
  const patchPath = path.join(skillsDir, fileName);

  let content: string;
  try {
    content = await fs.readFile(patchPath, 'utf-8');
  } catch {
    return {
      success: false,
      message: `Patch "${fileName}" not found in inbox.`,
    };
  }

  let parsed: Diff.StructuredPatch[];
  try {
    parsed = Diff.parsePatch(content);
  } catch (error) {
    return {
      success: false,
      message: `Failed to parse patch "${fileName}": ${getErrorMessage(error)}`,
    };
  }
  if (!hasParsedPatchHunks(parsed)) {
    return {
      success: false,
      message: `Patch "${fileName}" contains no valid hunks.`,
    };
  }

  const validatedHeaders = validateParsedSkillPatchHeaders(parsed);
  if (!validatedHeaders.success) {
    return {
      success: false,
      message:
        validatedHeaders.reason === 'missingTargetPath'
          ? `Patch "${fileName}" is missing a target file path.`
          : `Patch "${fileName}" has invalid diff headers.`,
    };
  }

  if (
    !config.isTrustedFolder() &&
    (await patchTargetsProjectSkills(
      validatedHeaders.patches.map((patch) => patch.targetPath),
      config,
    ))
  ) {
    return {
      success: false,
      message:
        'Project skill patches are unavailable until this workspace is trusted.',
    };
  }

  // Dry-run first: verify all patches apply cleanly before writing anything.
  // Repeated file blocks are validated against the progressively patched content.
  const applied = await applyParsedSkillPatches(parsed, config);
  if (!applied.success) {
    switch (applied.reason) {
      case 'missingTargetPath':
        return {
          success: false,
          message: `Patch "${fileName}" is missing a target file path.`,
        };
      case 'invalidPatchHeaders':
        return {
          success: false,
          message: `Patch "${fileName}" has invalid diff headers.`,
        };
      case 'outsideAllowedRoots':
        return {
          success: false,
          message: `Patch "${fileName}" targets a file outside the global/workspace skill directories: ${applied.targetPath}`,
        };
      case 'newFileAlreadyExists':
        return {
          success: false,
          message: `Patch "${fileName}" declares a new file, but the target already exists: ${applied.targetPath}`,
        };
      case 'targetNotFound':
        return {
          success: false,
          message: `Target file not found: ${applied.targetPath}`,
        };
      case 'doesNotApply':
        return {
          success: false,
          message: applied.isNewFile
            ? `Patch "${fileName}" failed to apply for new file ${applied.targetPath}.`
            : `Patch does not apply cleanly to ${applied.targetPath}.`,
        };
      default:
        return {
          success: false,
          message: `Patch "${fileName}" could not be applied.`,
        };
    }
  }

  let stagedTargets: StagedInboxPatchTarget[];
  try {
    stagedTargets = await stageInboxPatchTargets(applied.results);
  } catch (error) {
    return {
      success: false,
      message: `Patch "${fileName}" could not be staged: ${getErrorMessage(error)}.`,
    };
  }

  const committedTargets: StagedInboxPatchTarget[] = [];
  try {
    for (const stagedTarget of stagedTargets) {
      await fs.rename(stagedTarget.tempPath, stagedTarget.targetPath);
      committedTargets.push(stagedTarget);
    }
  } catch (error) {
    for (const committedTarget of committedTargets.reverse()) {
      try {
        await restoreCommittedInboxPatchTarget(committedTarget);
      } catch {
        // Best-effort rollback. We still report the commit failure below.
      }
    }
    await cleanupStagedInboxPatchTargets(
      stagedTargets.filter((target) => !committedTargets.includes(target)),
    );
    return {
      success: false,
      message: `Patch "${fileName}" could not be applied atomically: ${getErrorMessage(error)}.`,
    };
  }

  // Remove the patch file
  await fs.unlink(patchPath);

  const fileCount = applied.results.length;
  return {
    success: true,
    message: `Applied patch to ${fileCount} file${fileCount !== 1 ? 's' : ''}.`,
  };
}

/**
 * Removes a .patch file from the extraction inbox.
 */
export async function dismissInboxPatch(
  config: Config,
  fileName: string,
): Promise<{ success: boolean; message: string }> {
  if (!isValidInboxPatchFileName(fileName)) {
    return {
      success: false,
      message: 'Invalid patch file name.',
    };
  }

  const skillsDir = config.storage.getProjectSkillsMemoryDir();
  const patchPath = path.join(skillsDir, fileName);

  try {
    await fs.access(patchPath);
  } catch {
    return {
      success: false,
      message: `Patch "${fileName}" not found in inbox.`,
    };
  }

  await fs.unlink(patchPath);

  return {
    success: true,
    message: `Dismissed "${fileName}" from inbox.`,
  };
}
