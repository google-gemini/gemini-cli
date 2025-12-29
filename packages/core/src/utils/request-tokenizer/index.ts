/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export { DefaultRequestTokenizer } from './requestTokenizer.js';
import { DefaultRequestTokenizer } from './requestTokenizer.js';
export { TextTokenizer } from './textTokenizer.js';
export { ImageTokenizer } from './imageTokenizer.js';

export type {
  RequestTokenizer,
  TokenizerConfig,
  TokenCalculationResult,
  ImageMetadata,
} from './types.js';

// Singleton instance for convenient usage
let defaultTokenizer: DefaultRequestTokenizer | null = null;

/**
 * Get the default request tokenizer instance
 */
export function getDefaultTokenizer(): DefaultRequestTokenizer {
  if (!defaultTokenizer) {
    defaultTokenizer = new DefaultRequestTokenizer();
  }
  return defaultTokenizer;
}

/**
 * Dispose of the default tokenizer instance
 */
export async function disposeDefaultTokenizer(): Promise<void> {
  if (defaultTokenizer) {
    await defaultTokenizer.dispose();
    defaultTokenizer = null;
  }
}
