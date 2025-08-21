/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { IndexConfig } from './types.js';

export const DEFAULT_MODEL = "hf.co/ggml-org/jina-embeddings-v2-base-code-Q8_0-GGUF:Q8_0";
export const DEFAULT_EMBED_ENDPOINT = "http://localhost:11434/v1/embeddings";
export const DEFAULT_BATCH_SIZE = 32;
export const DEFAULT_MAX_TEXT_CHARS = 8192;
export const DEFAULT_MERGE_THRESHOLD = 40;
export const DEFAULT_SKIP_IF_LARGER_THAN = 50 * 1024 * 1024;
export const INDEX_DIR = ".index";

export const EXCLUDED_DIRS = new Set([
  '.git',
  '.index',
  'node_modules',
  '.vscode',
  '.idea',
  'dist',
  'build',
  'target',
  '__pycache__',
  '.pytest_cache'
]);

export const DEFAULT_CONFIG: IndexConfig = {
  embedEndpoint: (globalThis as any).process?.env?.EMBED_ENDPOINT || DEFAULT_EMBED_ENDPOINT,
  apiKey: (globalThis as any).process?.env?.API_KEY,
  batchSize: parseInt((globalThis as any).process?.env?.BATCH_SIZE || DEFAULT_BATCH_SIZE.toString()),
  maxTextChars: DEFAULT_MAX_TEXT_CHARS,
  mergeThreshold: DEFAULT_MERGE_THRESHOLD,
  skipIfLargerThan: DEFAULT_SKIP_IF_LARGER_THAN,
  excludePatterns: [],
  includePatterns: [],
  respectGeminiIgnore: true
};
