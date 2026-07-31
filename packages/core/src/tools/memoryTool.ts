/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { Storage } from '../config/storage.js';
import { resolveToRealPath } from '../utils/paths.js';

export const DEFAULT_CONTEXT_FILENAME = 'GEMINI.md';
export const PROJECT_MEMORY_INDEX_FILENAME = 'MEMORY.md';

// This variable will hold the currently configured filenames for GEMINI.md context files.
// It defaults to DEFAULT_CONTEXT_FILENAME but can be extended by setGeminiMdFilename.
let currentGeminiMdFilename: string | string[] = DEFAULT_CONTEXT_FILENAME;

/**
 * Adds one or more filenames to the current context filenames.
 * Ensures uniqueness and maintains order.
 */
export function setGeminiMdFilename(newFilename: string | string[]): void {
  const filenames = Array.isArray(newFilename) ? newFilename : [newFilename];
  const current = getAllGeminiMdFilenames();
  const next = new Set<string>();

  for (const filename of filenames) {
    const trimmed = filename.trim();
    if (trimmed !== '') {
      const normalized = path.normalize(trimmed);
      // Sanitize to prevent path traversal while allowing subdirectories
      const validatedPath = resolveToRealPath(normalized);
      if (validatedPath) {
        next.add(normalized);
      }
    }
  }

  for (const filename of current) {
    next.add(filename);
  }

  const result = Array.from(next);
  if (result.length > 1) {
    currentGeminiMdFilename = result;
  } else if (result.length === 1) {
    currentGeminiMdFilename = result[0];
  }
}

/**
 * Resets the context filenames to the provided value, or the default if none provided.
 * This replaces all current filenames.
 */
export function resetGeminiMdFilename(
  filename: string | string[] = DEFAULT_CONTEXT_FILENAME,
): void {
  const filenames = Array.isArray(filename) ? filename : [filename];
  const cleaned = Array.from(
    new Set(
      filenames
        .map((f) => path.normalize(f.trim()))
        .filter((f) => !!resolveToRealPath(f)),
    ),
  );

  if (cleaned.length === 0) {
    currentGeminiMdFilename = DEFAULT_CONTEXT_FILENAME;
  } else if (cleaned.length === 1) {
    currentGeminiMdFilename = cleaned[0];
  } else {
    currentGeminiMdFilename = cleaned;
  }
}

export function getCurrentGeminiMdFilename(): string {
  if (Array.isArray(currentGeminiMdFilename)) {
    return currentGeminiMdFilename[0];
  }
  return currentGeminiMdFilename;
}

export function getAllGeminiMdFilenames(): string[] {
  if (Array.isArray(currentGeminiMdFilename)) {
    return currentGeminiMdFilename;
  }
  return [currentGeminiMdFilename];
}

export function getGlobalMemoryFilePath(): string {
  return path.join(Storage.getGlobalGeminiDir(), getCurrentGeminiMdFilename());
}

export function getProjectMemoryIndexFilePath(storage: Storage): string {
  return path.join(
    storage.getProjectMemoryDir(),
    PROJECT_MEMORY_INDEX_FILENAME,
  );
}
