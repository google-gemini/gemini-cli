/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DEFAULT_IGNORED_FOLDERS } from '../utils/getFolderStructure.js';
import { debugLogger } from '../utils/debugLogger.js';

const DEFAULT_MAX_PER_CATEGORY = 30;

/** Relative paths under the skill root (POSIX `/` separators). */
export type SkillResourceIndex = {
  scripts: string[];
  references: string[];
  assets: string[];
  other: string[];
};

function toPosixRelative(skillRootAbs: string, fileAbs: string): string {
  return path.relative(skillRootAbs, fileAbs).split(path.sep).join('/');
}

function classifyPath(relPosix: string): keyof SkillResourceIndex | null {
  if (relPosix === 'SKILL.md') {
    return null;
  }
  if (relPosix.startsWith('scripts/')) {
    return 'scripts';
  }
  if (relPosix.startsWith('references/')) {
    return 'references';
  }
  if (relPosix.startsWith('assets/')) {
    return 'assets';
  }
  return 'other';
}

/**
 * Walks the skill root and builds a semantic index of bundled files.
 * Ignores the same directory basenames as {@link getFolderStructure}.
 * Does not follow symbolic links. Never throws; logs and returns partial/empty
 * buckets on failure.
 */
export async function buildSkillResourceIndex(
  skillRootAbs: string,
): Promise<SkillResourceIndex> {
  const root = path.resolve(skillRootAbs);
  const index: SkillResourceIndex = {
    scripts: [],
    references: [],
    assets: [],
    other: [],
  };

  async function walk(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error: unknown) {
      debugLogger.debug(
        `skillResourceIndex: could not read directory ${currentDir}:`,
        error,
      );
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const dirent of entries) {
      try {
        if (dirent.isSymbolicLink()) {
          continue;
        }
        const fullPath = path.join(currentDir, dirent.name);
        if (dirent.isDirectory()) {
          if (DEFAULT_IGNORED_FOLDERS.has(dirent.name)) {
            continue;
          }
          await walk(fullPath);
        } else if (dirent.isFile()) {
          const relPosix = toPosixRelative(root, fullPath);
          const bucket = classifyPath(relPosix);
          if (bucket) {
            index[bucket].push(relPosix);
          }
        }
      } catch (error: unknown) {
        debugLogger.debug(
          `skillResourceIndex: skipping entry under ${currentDir}:`,
          error,
        );
      }
    }
  }

  try {
    await walk(root);
  } catch (error: unknown) {
    debugLogger.debug(
      `skillResourceIndex: walk failed for ${root}:`,
      error,
    );
  }

  for (const key of Object.keys(index) as (keyof SkillResourceIndex)[]) {
    index[key].sort((a, b) => a.localeCompare(b));
  }

  return index;
}

export type FormatSkillResourceSummaryOptions = {
  maxPerCategory?: number;
};

/**
 * Renders a short, stable summary for prompts (paths only; never reads files).
 */
export function formatSkillResourceSummary(
  index: SkillResourceIndex,
  options?: FormatSkillResourceSummaryOptions,
): string {
  const maxPer = options?.maxPerCategory ?? DEFAULT_MAX_PER_CATEGORY;

  const allEmpty =
    index.scripts.length === 0 &&
    index.references.length === 0 &&
    index.assets.length === 0 &&
    index.other.length === 0;

  if (allEmpty) {
    return 'No indexed resource files under this skill (only SKILL.md or ignored dirs).';
  }

  const formatBucket = (label: string, paths: string[]): string => {
    if (paths.length === 0) {
      return `- ${label}: (none)`;
    }
    const shown = paths.slice(0, maxPer);
    const rest = paths.length - shown.length;
    const list = shown.join(', ');
    const suffix = rest > 0 ? ` … and ${rest} more` : '';
    return `- ${label}: ${list}${suffix}`;
  };

  return [
    'Skill resource index (paths relative to skill root):',
    formatBucket('References', index.references),
    formatBucket('Scripts', index.scripts),
    formatBucket('Assets', index.assets),
    formatBucket('Other', index.other),
  ].join('\n');
}

/**
 * Normalizes a user-provided relative path to POSIX segments, rejecting
 * traversal and absolute paths.
 */
export function normalizeRelativePosixPath(input: string): string {
  const trimmed = input.replace(/\\/g, '/').trim();
  if (trimmed === '') {
    throw new Error('Path is empty');
  }
  if (
    trimmed.startsWith('/') ||
    /^[A-Za-z]:\//.test(trimmed) ||
    /^[A-Za-z]:\\/.test(trimmed)
  ) {
    throw new Error('Absolute paths are not allowed');
  }
  const parts = trimmed.split('/').filter((p) => p !== '' && p !== '.');
  for (const p of parts) {
    if (p === '..') {
      throw new Error('Path traversal is not allowed');
    }
  }
  return parts.join('/');
}

/**
 * Resolves a relative POSIX path under root; rejects escape attempts.
 */
export function safeResolveWithinRoot(
  rootAbs: string,
  relativePosixPath: string,
): string {
  const root = path.resolve(rootAbs);
  const normalized = normalizeRelativePosixPath(relativePosixPath);
  const segments = normalized.split('/');
  const resolved = path.resolve(root, ...segments);
  const relToRoot = path.relative(root, resolved);
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
    throw new Error('Resolved path escapes skill root');
  }
  return resolved;
}

/**
 * Reads a UTF-8 file under skill root, only when the normalized path is under
 * `references/`. Intended for tests and future dedicated tools.
 */
export async function loadSkillReferenceFile(
  skillRootAbs: string,
  relativePathFromUser: string,
): Promise<string> {
  const normalized = normalizeRelativePosixPath(relativePathFromUser);
  if (!normalized.startsWith('references/')) {
    throw new Error('Only references/ paths are allowed');
  }
  const fullPath = safeResolveWithinRoot(skillRootAbs, normalized);
  return fs.readFile(fullPath, 'utf8');
}
