/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { validatePath, type Config } from '@google/gemini-cli-core';

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

/**
 * Resolves a path from an @-command, ensuring it is valid and within workspace boundaries.
 * Performs best-effort extraction if the input appears to be a misinterpreted log fragment.
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
    } catch {
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
    } catch {
      // Ignore errors for this specific directory, try next
    }
  }

  if (lastUnauthorized) {
    return { status: 'unauthorized', ...lastUnauthorized };
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
    // We handle nested wrappers like ("path/to/file.txt")
    let segmentToClean = segment;
    const wrapperPairs: Record<string, string> = {
      '(': ')',
      '[': ']',
      '{': '}',
      '"': '"',
      "'": "'",
    };

    let wasStripped = true;
    while (wasStripped && segmentToClean.length > 1) {
      wasStripped = false;
      const firstChar = segmentToClean[0];
      const lastChar = segmentToClean[segmentToClean.length - 1];
      if (wrapperPairs[firstChar] === lastChar) {
        segmentToClean = segmentToClean.slice(1, -1);
        wasStripped = true;
      }
    }

    // Also strip trailing common punctuation like comma, semicolon, period if not part of a wrapper
    segmentToClean = segmentToClean.replace(/[,;!.]$/, '');

    if (segmentToClean.length === 0) continue;

    // 2. Strip trailing line/column numbers (e.g. src/main.ts:10:5)
    // We use a non-greedy match for the path part
    const lineMatch = segmentToClean.match(/^(.+?):(\d+)(?::\d+)?$/);
    const pathOnly = lineMatch ? lineMatch[1] : segmentToClean;

    // 3. Sanitize extracted path to prevent path traversal and null byte injection
    const cleanSegment = pathOnly.replace(/\0/g, '').replace(/\.\./g, '');

    if (cleanSegment.length === 0) continue;

    // Check if the cleaned segment is considered "valid" by our heuristics
    // (i.e. no control chars, no markers, etc.)
    if (validatePath(cleanSegment).isValid) {
      // Prioritize segments that actually look like paths (have slashes or dots)
      if (
        cleanSegment.includes('/') ||
        cleanSegment.includes('\\') ||
        cleanSegment.includes('.')
      ) {
        return cleanSegment;
      }
    }
  }

  return null;
}
