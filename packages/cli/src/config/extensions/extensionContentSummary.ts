/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  collectContentEntries,
  compareCodeUnits,
  computeContentSignature,
  ContentMarker,
  type ContentEntry,
} from './contentSignature.js';

/** A path that a command or variable references through `${extensionPath}`. */
export interface ReferencedPath {
  /**
   * Path relative to the extension folder, with `/` separators. `.` is the
   * folder itself, and a path outside it keeps its relative form (`../x`).
   */
  path: string;
  /** Set when the path isn't read, for example because it's missing. */
  marker?: ContentMarker;
  /** Signature of the referenced file or folder. */
  signature: string;
}

/** One hook from `hooks/hooks.json`, with its values as written. */
export interface HookSummary {
  eventName: string;
  matcher?: string;
  name?: string;
  /** The command of a `command` hook. */
  command?: string;
  /** The hook type, for a hook without a command. */
  type?: string;
  /** Environment variables, sorted by name. */
  env: Array<[string, string]>;
}

/** The hooks that `hooks/hooks.json` declares and the files they use. */
export interface HooksSummary {
  /** Hooks in display order, or `undefined` if `hooks/hooks.json` isn't valid. */
  hooks?: HookSummary[];
  /** Every file under `hooks/`. */
  files: ContentEntry[];
  /** Paths that hook commands and environment variables reference. */
  referencedPaths: ReferencedPath[];
  /** Signature of the files under `hooks/` and the referenced paths. */
  signature: string;
}

/**
 * What an extension folder adds to the CLI, read from the raw files on disk
 * without resolving variables, so two folders with the same files have the same
 * summary.
 */
export interface ExtensionContentSummary {
  hooks?: HooksSummary;
}

const EXTENSION_PATH_VARIABLE = '${extensionPath}';
const PATH_SEPARATOR_VARIABLES = /\$\{(?:\/|pathSeparator)\}/g;
const PATH_END = /[\s"'`;|&<>(),:$]/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const HOOKS_FILE = 'hooks/hooks.json';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Returns a value read from JSON as text, or `undefined` if it's missing. */
function asText(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function toMarker(value: string): ContentMarker | undefined {
  return Object.values(ContentMarker).find((marker) => marker === value);
}

function toReferencedPath(suffix: string): Omit<ReferencedPath, 'signature'> {
  const posixSuffix = suffix.replaceAll('\\', '/');
  if (posixSuffix !== '' && !posixSuffix.startsWith('/')) {
    // For example `${extensionPath}-data/x`, a sibling of the extension folder.
    return {
      path: `${EXTENSION_PATH_VARIABLE}${posixSuffix}`,
      marker: ContentMarker.Outside,
    };
  }
  const relativePath = path.posix
    .normalize(`.${posixSuffix}`)
    .replace(/\/+$/, '');
  if (relativePath === '' || relativePath === '.') {
    return { path: '.', marker: ContentMarker.Root };
  }
  if (relativePath === '..' || relativePath.startsWith('../')) {
    return { path: relativePath, marker: ContentMarker.Outside };
  }
  return { path: relativePath };
}

/**
 * Finds the paths that `values` reference through `${extensionPath}`, sorted
 * by UTF-16 code units. `${/}` and `${pathSeparator}` count as `/`, and each
 * path ends at whitespace, a quote, or a shell operator.
 */
export function findReferencedPaths(
  values: readonly string[],
): Array<Omit<ReferencedPath, 'signature'>> {
  const found = new Map<string, Omit<ReferencedPath, 'signature'>>();
  for (const value of values) {
    const text = value.replace(PATH_SEPARATOR_VARIABLES, '/');
    let start = text.indexOf(EXTENSION_PATH_VARIABLE);
    while (start !== -1) {
      let end = start + EXTENSION_PATH_VARIABLE.length;
      while (end < text.length && !PATH_END.test(text[end])) {
        end++;
      }
      const reference = toReferencedPath(
        text.slice(start + EXTENSION_PATH_VARIABLE.length, end),
      );
      found.set(reference.path, reference);
      start = text.indexOf(EXTENSION_PATH_VARIABLE, end);
    }
  }
  return [...found.values()].sort((a, b) => compareCodeUnits(a.path, b.path));
}

/**
 * Hashes the referenced paths inside `rootDir`. A path that is the folder
 * itself, leaves it, or doesn't exist is recorded with a marker and isn't read.
 */
export async function collectReferencedPaths(
  rootDir: string,
  references: ReadonlyArray<Omit<ReferencedPath, 'signature'>>,
): Promise<{ referencedPaths: ReferencedPath[]; entries: ContentEntry[] }> {
  const referencedPaths: ReferencedPath[] = [];
  const entries: ContentEntry[] = [];
  for (const reference of references) {
    let found = reference.marker
      ? undefined
      : await collectContentEntries(rootDir, reference.path);
    let marker = reference.marker;
    if (!found) {
      marker ??= ContentMarker.Missing;
      found = [{ path: reference.path, type: 'reference', value: marker }];
    } else if (found.length === 1 && found[0].path === reference.path) {
      // For example a link that leaves the folder.
      const entryMarker = toMarker(found[0].value);
      if (entryMarker && entryMarker !== ContentMarker.Directory) {
        marker = entryMarker;
      }
    }
    referencedPaths.push({
      path: reference.path,
      ...(marker ? { marker } : {}),
      signature: computeContentSignature(found),
    });
    entries.push(...found);
  }
  return { referencedPaths, entries };
}

/** Returns true if `entries` has a hash (not a marker) for `relativePath`. */
export function hasReadableFile(
  entries: readonly ContentEntry[],
  relativePath: string,
): boolean {
  return entries.some(
    (entry) => entry.path === relativePath && SHA256_PATTERN.test(entry.value),
  );
}

/** Reads a text file inside `rootDir`, or returns `undefined` on failure. */
export async function readTextFile(
  rootDir: string,
  relativePath: string,
): Promise<string | undefined> {
  try {
    return await fs.readFile(
      path.join(rootDir, ...relativePath.split('/')),
      'utf-8',
    );
  } catch {
    return undefined;
  }
}

function parseEnv(value: unknown): Array<[string, string]> {
  if (!isRecord(value)) {
    return [];
  }
  return Object.keys(value)
    .sort(compareCodeUnits)
    .map((name) => [name, asText(value[name]) ?? '']);
}

/**
 * Lists the hooks of a `hooks/hooks.json` file: events sorted by name, and the
 * hooks of each event in file order. Returns `undefined` if the file isn't
 * valid JSON or `hooks` isn't an object.
 */
export function parseHooksFile(content: string): HookSummary[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || !isRecord(parsed['hooks'])) {
    return undefined;
  }
  const hooksByEvent = parsed['hooks'];
  const hooks: HookSummary[] = [];
  for (const eventName of Object.keys(hooksByEvent).sort(compareCodeUnits)) {
    for (const definition of toArray(hooksByEvent[eventName])) {
      if (!isRecord(definition)) {
        continue;
      }
      const matcher = asText(definition['matcher']);
      for (const hook of toArray(definition['hooks'])) {
        if (!isRecord(hook)) {
          continue;
        }
        const name = asText(hook['name']);
        const command = asText(hook['command']);
        hooks.push({
          eventName,
          ...(matcher !== undefined ? { matcher } : {}),
          ...(name !== undefined ? { name } : {}),
          ...(command !== undefined
            ? { command }
            : { type: asText(hook['type']) ?? '' }),
          env: parseEnv(hook['env']),
        });
      }
    }
  }
  return hooks;
}

async function summarizeHooks(
  rootDir: string,
): Promise<HooksSummary | undefined> {
  try {
    await fs.stat(path.join(rootDir, 'hooks', 'hooks.json'));
  } catch {
    return undefined;
  }
  const files = (await collectContentEntries(rootDir, 'hooks')) ?? [];
  let hooks: HookSummary[] | undefined;
  if (hasReadableFile(files, HOOKS_FILE)) {
    const content = await readTextFile(rootDir, HOOKS_FILE);
    hooks = content === undefined ? undefined : parseHooksFile(content);
  }
  const { referencedPaths, entries } = await collectReferencedPaths(
    rootDir,
    findReferencedPaths(
      (hooks ?? []).flatMap((hook) => [
        hook.command ?? '',
        ...hook.env.map(([, value]) => value),
      ]),
    ),
  );
  return {
    ...(hooks ? { hooks } : {}),
    files,
    referencedPaths,
    signature: computeContentSignature([...files, ...entries]),
  };
}

/**
 * Builds the summary of an extension folder from its raw files. Variables such
 * as `${extensionPath}` stay as written, and nothing outside the folder is
 * read.
 */
export async function buildExtensionContentSummary(
  extensionDir: string,
): Promise<ExtensionContentSummary> {
  const hooks = await summarizeHooks(extensionDir);
  return {
    ...(hooks ? { hooks } : {}),
  };
}
