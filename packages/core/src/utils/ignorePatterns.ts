/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import type { Config } from '../config/config.js';
import { getCurrentGeminiMdFilename } from '../tools/memoryTool.js';

/**
 * Common ignore patterns used across multiple tools for basic exclusions.
 * These are the most commonly ignored directories in development projects.
 */
export const COMMON_IGNORE_PATTERNS: string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/bower_components/**',
  '**/.svn/**',
  '**/.hg/**',
];

/**
 * Binary file extension patterns that are typically excluded from text processing.
 */
export const BINARY_FILE_PATTERNS: string[] = [
  '**/*.bin',
  '**/*.exe',
  '**/*.dll',
  '**/*.so',
  '**/*.dylib',
  '**/*.class',
  '**/*.jar',
  '**/*.war',
  '**/*.zip',
  '**/*.tar',
  '**/*.gz',
  '**/*.bz2',
  '**/*.rar',
  '**/*.7z',
  '**/*.doc',
  '**/*.docx',
  '**/*.xls',
  '**/*.xlsx',
  '**/*.ppt',
  '**/*.pptx',
  '**/*.odt',
  '**/*.ods',
  '**/*.odp',
];

/**
 * Media file patterns that require special handling in tools like read-many-files.
 * These files can be processed as inlineData when explicitly requested.
 */
export const MEDIA_FILE_PATTERNS: string[] = [
  '**/*.pdf',
  '**/*.png',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.gif',
  '**/*.webp',
  '**/*.bmp',
  '**/*.svg',
];

/**
 * Common directory patterns that are typically ignored in development projects.
 */
export const COMMON_DIRECTORY_EXCLUDES: string[] = [
  '**/.vscode/**',
  '**/.idea/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/__pycache__/**',
];

/**
 * Python-specific patterns.
 */
export const PYTHON_EXCLUDES: string[] = ['**/*.pyc', '**/*.pyo'];

/**
 * System and environment file patterns.
 */
export const SYSTEM_FILE_EXCLUDES: string[] = ['**/.DS_Store', '**/.env'];

/**
 * Comprehensive file exclusion patterns combining all common ignore patterns.
 * These patterns are compatible with glob ignore patterns.
 * Note: Media files (PDF, images) are not excluded here as they need special handling in read-many-files.
 */
export const DEFAULT_FILE_EXCLUDES: string[] = [
  ...COMMON_IGNORE_PATTERNS,
  ...COMMON_DIRECTORY_EXCLUDES,
  ...BINARY_FILE_PATTERNS,
  ...PYTHON_EXCLUDES,
  ...SYSTEM_FILE_EXCLUDES,
];

/**
 * Options for configuring file exclusion patterns.
 */
export interface ExcludeOptions {
  /**
   * Whether to include default exclusion patterns. Defaults to true.
   */
  includeDefaults?: boolean;

  /**
   * Additional custom patterns from configuration.
   */
  customPatterns?: string[];

  /**
   * Additional patterns provided at runtime (e.g., from CLI arguments).
   */
  runtimePatterns?: string[];

  /**
   * Whether to include dynamic patterns like the current Gemini MD filename. Defaults to true.
   */
  includeDynamicPatterns?: boolean;
}

/**
 * Centralized file exclusion utility that provides configurable and extensible
 * file exclusion patterns for different tools and use cases.
 */
export class FileExclusions {
  constructor(private config?: Config) {}

  /**
   * Gets core ignore patterns for basic file operations like glob.
   * These are the minimal essential patterns that should almost always be excluded.
   */
  getCoreIgnorePatterns(): string[] {
    return [...COMMON_IGNORE_PATTERNS];
  }

  /**
   * Gets comprehensive default exclusion patterns for operations like read-many-files.
   * Includes all standard exclusions: directories, binary files, system files, etc.
   */
  getDefaultExcludePatterns(options: ExcludeOptions = {}): string[] {
    const {
      includeDefaults = true,
      customPatterns = [],
      runtimePatterns = [],
      includeDynamicPatterns = true,
    } = options;

    const patterns: string[] = [];

    // Add base defaults if requested
    if (includeDefaults) {
      patterns.push(...DEFAULT_FILE_EXCLUDES);
    }

    // Add dynamic patterns (like current Gemini MD filename)
    if (includeDynamicPatterns) {
      patterns.push(`**/${getCurrentGeminiMdFilename()}`);
    }

    // Add custom patterns from configuration
    // TODO: getCustomExcludes method needs to be implemented in Config interface
    if (this.config) {
      const configCustomExcludes = this.config.getCustomExcludes?.() ?? [];
      patterns.push(...configCustomExcludes);
    }

    // Add user-provided custom patterns
    patterns.push(...customPatterns);

    // Add runtime patterns (e.g., from CLI)
    patterns.push(...runtimePatterns);

    return patterns;
  }

  /**
   * Gets exclude patterns for read-many-files tool with legacy compatibility.
   * This maintains the same behavior as the previous getDefaultExcludes() function.
   */
  getReadManyFilesExcludes(additionalExcludes: string[] = []): string[] {
    return this.getDefaultExcludePatterns({
      includeDefaults: true,
      runtimePatterns: additionalExcludes,
      includeDynamicPatterns: true,
    });
  }

  /**
   * Gets exclude patterns for glob tool operations.
   * Uses core patterns by default but can be extended with additional patterns.
   */
  getGlobExcludes(additionalExcludes: string[] = []): string[] {
    const corePatterns = this.getCoreIgnorePatterns();

    // Add any custom patterns from config if available
    // TODO: getCustomExcludes method needs to be implemented in Config interface
    const configPatterns = this.config?.getCustomExcludes?.() ?? [];

    return [...corePatterns, ...configPatterns, ...additionalExcludes];
  }

  /**
   * Builds exclude patterns with full customization options.
   * This is the most flexible method for advanced use cases.
   */
  buildExcludePatterns(options: ExcludeOptions): string[] {
    return this.getDefaultExcludePatterns(options);
  }
}

/**
 * Extracts file extensions from glob patterns.
 * Converts patterns like glob/*.exe to .exe
 * Handles brace expansion like glob/*.{js,ts} to .js and .ts
 */
export function extractExtensionsFromPatterns(patterns: string[]): string[] {
  const extensions = new Set(
    patterns
      .filter((pattern) => pattern.includes('*.'))
      .flatMap((pattern) => {
        const extPart = pattern.substring(pattern.lastIndexOf('*.') + 1);
        // Handle brace expansion e.g. `**/*.{jpg,png}`
        if (extPart.startsWith('.{') && extPart.endsWith('}')) {
          const inner = extPart.slice(2, -1); // get 'jpg,png'
          return inner
            .split(',')
            .map((ext) => `.${ext.trim()}`)
            .filter((ext) => ext !== '.');
        }
        // Handle simple/compound/dotfile extensions
        if (
          extPart.startsWith('.') &&
          !extPart.includes('/') &&
          !extPart.includes('{') &&
          !extPart.includes('}')
        ) {
          // Using path.extname on a dummy file handles various cases like
          // '.tar.gz' -> '.gz' and '.profile' -> '.profile' correctly.
          const extracted = path.extname(`dummy${extPart}`);
          // If extname returns empty (e.g. for '.'), use the original part.
          // Then filter out empty or '.' results and invalid double dot patterns.
          const result = extracted || extPart;
          return result && result !== '.' && !result.substring(1).includes('.')
            ? [result]
            : [];
        }
        return [];
      }),
  );
  return Array.from(extensions).sort();
}

/**
 * Binary file extensions extracted from BINARY_FILE_PATTERNS for quick lookup.
 * Additional extensions not covered by the patterns are included for completeness.
 */
export const BINARY_EXTENSIONS: string[] = [
  ...extractExtensionsFromPatterns([
    ...BINARY_FILE_PATTERNS,
    ...MEDIA_FILE_PATTERNS,
    ...PYTHON_EXCLUDES,
  ]),
  // Additional binary extensions not in the main patterns
  '.dat',
  '.obj',
  '.o',
  '.a',
  '.lib',
  '.wasm',
].sort();
