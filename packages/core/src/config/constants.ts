/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface FileFilteringOptions {
  respectGitIgnore: boolean;
  respectGeminiIgnore: boolean;
  maxFileCount?: number;
  searchTimeout?: number;
  customIgnoreFilePaths: string[];
}

// For memory files
export const DEFAULT_MEMORY_FILE_FILTERING_OPTIONS: FileFilteringOptions = {
  respectGitIgnore: false,
  respectGeminiIgnore: true,
  maxFileCount: 20000,
  searchTimeout: 5000,
  customIgnoreFilePaths: [],
};

// For all other files
export const DEFAULT_FILE_FILTERING_OPTIONS: FileFilteringOptions = {
  respectGitIgnore: true,
  respectGeminiIgnore: true,
  maxFileCount: 20000,
  searchTimeout: 5000,
  customIgnoreFilePaths: [],
};

// Generic exclusion file name
export const GEMINI_IGNORE_FILE_NAME = '.geminiignore';
