/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { validatePath } from './path-validator.js';
import { type Config } from '../config/config.js';
import { isNodeError, getErrorMessage } from './errors.js';

export interface ResolvedAtCommandPath {
  absolutePath: string;
  relativePath: string;
  stats: {
    isDirectory(): boolean;
    isFile(): boolean;
  };
}

/**
 * Result of a path resolution attempt.
 */
export type ResolveAtCommandPathResult =
  | { status: 'resolved'; resolved: ResolvedAtCommandPath }
  | { status: 'unauthorized'; absolutePath: string; error: string }
  | { status: 'invalid'; error: string }
  | { status: 'not_found' };

const LINE_NUMBER_SUFFIX_REGEX =
  /^(.+?)(?::\d+(?::\d+)?(?:-\d+(?::\d+)?)?:?|#L?\d+(?:-(?:#?L)?\d+)?)$/i;

/**
 * Strips a trailing line/column/range reference (e.g. `:10`, `:10-20`, `:10:5`,
 * `#L10`, `#L10-L25`, `#L10-#L25`) from a path string if present.
 * Returns the base path without the suffix, or null if no suffix was present.
 */
export function stripLineNumberSuffix(pathStr: string): string | null {
  const match = pathStr.match(LINE_NUMBER_SUFFIX_REGEX);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

/**
 * Resolves a path from an @-command, ensuring it is valid and within workspace boundaries.
 * Performs best-effort extraction if the input appears to be a misinterpreted log fragment
 * or includes a trailing line/range reference (e.g., `file.ts:10` or `file.ts:10-20`).
 */
export async function resolveAtCommandPath(
  pathName: string,
  config: Config,
  onDebugMessage: (msg: string) => void = () => {},
): Promise<ResolveAtCommandPathResult> {
  const pathValidation = validatePath(pathName);
  if (!pathValidation.isValid) {
    // Attempt to extract a real path from the invalid fragment
    const extractedPath = tryExtractPath(pathName);
    if (extractedPath && extractedPath !== pathName) {
      onDebugMessage(
        `Identified invalid path fragment, attempting to extract path: "${extractedPath}" from "${pathName}"`,
      );
      // Recurse once with the extracted path.
      return resolveAtCommandPath(extractedPath, config, onDebugMessage);
    }

    onDebugMessage(
      `Skipping invalid path in @-command: ${pathName}. Reason: ${pathValidation.error}`,
    );
    return { status: 'invalid', error: pathValidation.error! };
  }

  const workspaceDirs = config.getWorkspaceContext().getDirectories();

  // If it's an absolute path, we only need to check it against authorization once.
  if (path.isAbsolute(pathName)) {
    const validationError = config.validatePathAccess(pathName, 'read');
    if (validationError) {
      onDebugMessage(
        `Skipping unauthorized absolute path: ${pathName}. Reason: ${validationError}`,
      );
      return {
        status: 'unauthorized',
        absolutePath: pathName,
        error: validationError,
      };
    }

    try {
      const stats = await fs.stat(pathName);
      // Try to find if it's within one of the workspace directories to provide a nice relative path
      let relativePath = pathName;
      for (const dir of workspaceDirs) {
        const rel = path.relative(dir, pathName);
        if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
          relativePath = rel;
          break;
        }
      }

      return {
        status: 'resolved',
        resolved: {
          absolutePath: pathName,
          relativePath,
          stats,
        },
      };
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') {
        onDebugMessage(
          `Unexpected error stating path ${pathName}: ${getErrorMessage(error)}`,
        );
      }
      const strippedPath = stripLineNumberSuffix(pathName);
      if (strippedPath && strippedPath !== pathName) {
        onDebugMessage(
          `Path "${pathName}" not found directly, attempting to resolve without line suffix: "${strippedPath}"`,
        );
        return resolveAtCommandPath(strippedPath, config, onDebugMessage);
      }
      return { status: 'not_found' };
    }
  }

  // For relative paths, try each workspace directory.
  let lastUnauthorized: { absolutePath: string; error: string } | null = null;

  for (const dir of workspaceDirs) {
    const absolutePath = path.resolve(dir, pathName);

    // Final workspace boundary check using centralized logic
    const validationError = config.validatePathAccess(absolutePath, 'read');
    if (validationError) {
      onDebugMessage(
        `Skipping unauthorized path: ${absolutePath}. Reason: ${validationError}`,
      );
      // We only care about unauthorized paths if we can't find a valid authorized one.
      lastUnauthorized = { absolutePath, error: validationError };
      continue;
    }

    try {
      const stats = await fs.stat(absolutePath);
      return {
        status: 'resolved',
        resolved: {
          absolutePath,
          relativePath: pathName,
          stats,
        },
      };
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        // Expected if path is not in this directory, continue to next
        continue;
      }
      onDebugMessage(
        `Unexpected error stating path ${absolutePath}: ${getErrorMessage(error)}`,
      );
    }
  }

  if (lastUnauthorized) {
    return { status: 'unauthorized', ...lastUnauthorized };
  }

  const strippedPath = stripLineNumberSuffix(pathName);
  if (strippedPath && strippedPath !== pathName) {
    onDebugMessage(
      `Path "${pathName}" not found directly, attempting to resolve without line suffix: "${strippedPath}"`,
    );
    return resolveAtCommandPath(strippedPath, config, onDebugMessage);
  }

  return { status: 'not_found' };
}

/**
 * Attempts to extract a valid-looking path from a noisy string (like a log fragment).
 */
function tryExtractPath(noisyString: string): string | null {
  // Split by whitespace to find individual segments
  const segments = noisyString.split(/\s+/);

  for (const segment of segments) {
    // 1. Strip leading/trailing punctuation and quotes commonly found in logs
    // We handle nested wrappers like ("path/to/file.txt") or (at src/index.ts)
    let segmentToClean = segment;
    const wrappers = [
      '(',
      ')',
      '[',
      ']',
      '{',
      '}',
      '"',
      "'",
      ',',
      ';',
      '!',
      '.',
    ];

    let wasStripped = true;
    while (wasStripped && segmentToClean.length > 0) {
      wasStripped = false;
      const firstChar = segmentToClean[0];
      const lastChar = segmentToClean[segmentToClean.length - 1];

      // Strip known punctuation from the start or end
      if (wrappers.includes(firstChar)) {
        segmentToClean = segmentToClean.slice(1);
        wasStripped = true;
      } else if (wrappers.includes(lastChar)) {
        segmentToClean = segmentToClean.slice(0, -1);
        wasStripped = true;
      }
    }

    if (segmentToClean.length === 0) continue;

    // 2. Strip trailing line/column/range numbers (e.g. src/main.ts:10:5, src/main.ts:10-20, src/main.ts#L10-#L25)
    // We handle the case where it might be wrapped in more text, e.g. at (src/index.ts:123)
    const strippedLineSuffix = stripLineNumberSuffix(segmentToClean);
    const lineMatch =
      strippedLineSuffix ?? segmentToClean.match(/^(.+?):(\d+)(?::\d+)?/)?.[1];
    const pathOnly = lineMatch ?? segmentToClean;

    // 3. Validate the extracted segment using centralized heuristics.
    // We rely on validatePath and Config.validatePathAccess for robust checking
    // rather than naive string stripping which can be bypassed or corrupt valid names.
    if (validatePath(pathOnly).isValid) {
      // Prioritize segments that actually look like paths (have slashes or dots)
      if (
        pathOnly.includes('/') ||
        pathOnly.includes('\\') ||
        pathOnly.includes('.')
      ) {
        return pathOnly;
      }
    }
  }

  return null;
}
