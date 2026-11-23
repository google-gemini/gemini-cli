/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import type { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { isSubpath } from '@google/gemini-cli-core';

/**
 * Kind of an entry in a content signature:
 * - `file`: a regular file.
 * - `dir`: a folder that was already walked through another path.
 * - `link`: a symbolic link. Links that stay inside the extension folder are
 *   followed; links that leave it or don't resolve get a marker.
 * - `other`: a FIFO, socket, or device. These are never read.
 * - `reference`: a path referenced by a command that can't be read.
 */
export type ContentEntryType = 'file' | 'dir' | 'link' | 'other' | 'reference';

/** Values recorded instead of a SHA-256 hash. */
export enum ContentMarker {
  /** The link points to a folder; its entries follow under the link path. */
  Directory = 'dir',
  /** The path resolves outside the extension folder, so it isn't read. */
  Outside = 'outside',
  /** The link target doesn't exist. */
  Dangling = 'dangling',
  /** The folder was already walked, for example through a link loop. */
  Visited = 'visited',
  /** Not a regular file, folder, or link. */
  Unsupported = 'unsupported',
  /** The path exists but can't be read. */
  Unreadable = 'unreadable',
  /** The referenced path doesn't exist. */
  Missing = 'missing',
  /** The reference points to the extension folder itself. */
  Root = 'root',
}

/** One entry of a content signature. */
export interface ContentEntry {
  /** Path relative to the extension folder, with `/` separators. */
  path: string;
  type: ContentEntryType;
  /** SHA-256 (hex) of the file bytes, or a {@link ContentMarker}. */
  value: string;
}

/** Returns `value` as a {@link ContentMarker}, or `undefined` for a hash. */
export function asContentMarker(value: string): ContentMarker | undefined {
  return Object.values(ContentMarker).find((marker) => marker === value);
}

/**
 * Compares two strings by UTF-16 code units, so the order doesn't depend on
 * the locale.
 */
export function compareCodeUnits(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/** Returns the SHA-256 (hex) of `content`. */
export function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

function entryLine(entry: ContentEntry): string {
  return `${entry.path}\0${entry.type}\0${entry.value}`;
}

/**
 * Returns the SHA-256 (hex) of the unique entry lines
 * (`<path>\0<type>\0<value>`), sorted by UTF-16 code units and joined with
 * `\n`.
 */
export function computeContentSignature(
  entries: readonly ContentEntry[],
): string {
  const lines = [...new Set(entries.map(entryLine))].sort(compareCodeUnits);
  return sha256(lines.join('\n'));
}

interface WalkState {
  rootRealPath: string;
  startPath: string;
  startRealPath: string;
  visitedFolders: Set<string>;
  entries: ContentEntry[];
}

function typeOf(stats: Stats): ContentEntryType {
  if (stats.isSymbolicLink()) {
    return 'link';
  }
  if (stats.isDirectory()) {
    return 'dir';
  }
  return stats.isFile() ? 'file' : 'other';
}

async function walk(
  state: WalkState,
  absolutePath: string,
  relativePath: string,
): Promise<void> {
  let stats: Stats;
  try {
    stats = await fs.lstat(absolutePath);
  } catch {
    state.entries.push({
      path: relativePath,
      type: 'reference',
      value: ContentMarker.Missing,
    });
    return;
  }
  const type = typeOf(stats);
  const isLink = type === 'link';

  let realPath: string;
  try {
    realPath = await fs.realpath(absolutePath);
  } catch {
    state.entries.push({
      path: relativePath,
      type,
      value: ContentMarker.Dangling,
    });
    return;
  }
  if (!isSubpath(state.rootRealPath, realPath)) {
    state.entries.push({
      path: relativePath,
      type,
      value: ContentMarker.Outside,
    });
    return;
  }

  try {
    const target = isLink ? await fs.stat(realPath) : stats;
    if (target.isFile()) {
      state.entries.push({
        path: relativePath,
        type,
        value: sha256(await fs.readFile(realPath)),
      });
      return;
    }
    if (!target.isDirectory()) {
      state.entries.push({
        path: relativePath,
        type,
        value: ContentMarker.Unsupported,
      });
      return;
    }
    // A link to a folder that holds the starting point (or that was already
    // walked) would walk the same files again, or never end.
    if (
      state.visitedFolders.has(realPath) ||
      (isLink &&
        absolutePath !== state.startPath &&
        isSubpath(realPath, state.startRealPath))
    ) {
      state.entries.push({
        path: relativePath,
        type,
        value: ContentMarker.Visited,
      });
      return;
    }
    state.visitedFolders.add(realPath);
    if (isLink) {
      state.entries.push({
        path: relativePath,
        type,
        value: ContentMarker.Directory,
      });
    }
    const names = (await fs.readdir(realPath)).sort(compareCodeUnits);
    for (const name of names) {
      await walk(state, path.join(realPath, name), `${relativePath}/${name}`);
    }
  } catch {
    state.entries.push({
      path: relativePath,
      type,
      value: ContentMarker.Unreadable,
    });
  }
}

/**
 * Lists the entries of `relativePath`, a file or folder inside `rootDir`
 * given with `/` separators. Regular files are hashed (raw bytes, ignoring
 * permissions and dates) and folders are walked. Links that stay inside
 * `rootDir` are followed; anything else gets a {@link ContentMarker}. Nothing
 * outside `rootDir` is ever read.
 *
 * @returns The entries in walk order, or `undefined` when the path doesn't
 * exist.
 */
export async function collectContentEntries(
  rootDir: string,
  relativePath: string,
): Promise<ContentEntry[] | undefined> {
  const absolutePath = path.join(rootDir, ...relativePath.split('/'));
  let rootRealPath: string;
  try {
    rootRealPath = await fs.realpath(rootDir);
    await fs.lstat(absolutePath);
  } catch {
    return undefined;
  }
  let startRealPath = absolutePath;
  try {
    startRealPath = await fs.realpath(absolutePath);
  } catch {
    // A dangling link; `walk` records it.
  }
  const state: WalkState = {
    rootRealPath,
    startPath: absolutePath,
    startRealPath,
    visitedFolders: new Set(),
    entries: [],
  };
  await walk(state, absolutePath, relativePath);
  return state.entries;
}

function needsEscape(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x2028 && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069) ||
    code === 0xfeff
  );
}

function escapeCodeUnit(code: number): string {
  switch (code) {
    case 0x09:
      return '\\t';
    case 0x0a:
      return '\\n';
    case 0x0d:
      return '\\r';
    default:
      return `\\u${code.toString(16).padStart(4, '0')}`;
  }
}

/**
 * Replaces characters that can hide or reshape text in a terminal with
 * JSON-style escapes (`\n`, `\r`, `\t`, `\u001b`): C0 and C1 controls, DEL,
 * zero-width characters, line and paragraph separators, bidirectional
 * controls, and the byte order mark. The result always fits on one line, and
 * ANSI sequences show as text.
 */
export function escapeForDisplay(value: string): string {
  let result = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    result += needsEscape(code) ? escapeCodeUnit(code) : value[i];
  }
  return result;
}

/**
 * Wraps `value` in a Markdown code span that renders verbatim. The backtick
 * fence is one longer than the longest run of backticks in the value. Markdown
 * removes one space from each side of a code span when both sides have one, so
 * a space of padding is added when the value starts or ends with a backtick, or
 * starts and ends with a space.
 */
export function formatCodeSpan(value: string): string {
  if (value === '') {
    return '``';
  }
  let longestRun = 0;
  for (const run of value.match(/`+/g) ?? []) {
    longestRun = Math.max(longestRun, run.length);
  }
  const fence = '`'.repeat(longestRun + 1);
  const needsPadding =
    value.startsWith('`') ||
    value.endsWith('`') ||
    (value.startsWith(' ') && value.endsWith(' ') && /[^ ]/.test(value));
  const padding = needsPadding ? ' ' : '';
  return `${fence}${padding}${value}${padding}${fence}`;
}

/**
 * Formats a value read from extension files for the consent text: escaped
 * with {@link escapeForDisplay} and wrapped in a code span with
 * {@link formatCodeSpan}.
 */
export function formatValueForDisplay(value: string): string {
  return formatCodeSpan(escapeForDisplay(value));
}
