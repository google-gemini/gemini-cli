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
  const results = new Map<string, AppliedSkillPatchTarget>();
  const patchedContentByTarget = new Map<string, string>();
  const originalContentByTarget = new Map<string, string>();

  const validatedHeaders = validateParsedSkillPatchHeaders(parsedPatches);
  if (!validatedHeaders.success) {
    return validatedHeaders;
  }

  for (const [index, patch] of parsedPatches.entries()) {
    const { targetPath, isNewFile } = validatedHeaders.patches[index];

    const resolvedTargetPath = await resolveAllowedSkillPatchTarget(
      targetPath,
      config,
    );
    if (!resolvedTargetPath) {
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
