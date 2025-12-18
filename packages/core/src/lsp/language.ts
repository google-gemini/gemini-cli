/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Language ID mapping for LSP
 *
 * Maps file extensions to LSP language identifiers.
 */

import * as path from 'node:path';

/**
 * Mapping of file extensions to LSP language IDs.
 * These identifiers are standardized across LSP servers.
 */
export const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // TypeScript/JavaScript (MVP focus)
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.mts': 'typescript',
  '.cts': 'typescript',

  // Future language support (commented for reference)
  // '.py': 'python',
  // '.pyi': 'python',
  // '.go': 'go',
  // '.rs': 'rust',
  // '.rb': 'ruby',
  // '.java': 'java',
  // '.c': 'c',
  // '.cpp': 'cpp',
  // '.h': 'c',
  // '.hpp': 'cpp',
  // '.cs': 'csharp',
  // '.vue': 'vue',
  // '.svelte': 'svelte',
  // '.php': 'php',
  // '.swift': 'swift',
  // '.kt': 'kotlin',
  // '.scala': 'scala',
  // '.ex': 'elixir',
  // '.exs': 'elixir',
  // '.zig': 'zig',
  // '.lua': 'lua',
  // '.sh': 'shellscript',
  // '.bash': 'shellscript',
  // '.zsh': 'shellscript',
  // '.yaml': 'yaml',
  // '.yml': 'yaml',
  // '.json': 'json',
  // '.jsonc': 'jsonc',
  // '.md': 'markdown',
  // '.html': 'html',
  // '.css': 'css',
  // '.scss': 'scss',
  // '.less': 'less',
};

/**
 * Get the LSP language ID for a file path.
 *
 * @param filePath - The path to the file
 * @returns The LSP language ID, or undefined if not supported
 */
export function getLanguageId(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext];
}

/**
 * Check if a file is supported by any LSP server.
 *
 * @param filePath - The path to the file
 * @returns True if the file extension is supported
 */
export function isLanguageSupported(filePath: string): boolean {
  return getLanguageId(filePath) !== undefined;
}

/**
 * Get all supported file extensions.
 *
 * @returns Array of supported file extensions (with leading dot)
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(EXTENSION_TO_LANGUAGE);
}
