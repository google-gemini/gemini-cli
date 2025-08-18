/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export * from './types.js';
export * from './base.js';
export * from './file.js';
export * from './hybrid.js';
// Note: KeychainTokenStorage is dynamically imported when needed to avoid initialization issues

import { HybridTokenStorage } from './hybrid.js';
import { ITokenStorage } from './types.js';

let defaultStorage: ITokenStorage | null = null;

export function getDefaultTokenStorage(): ITokenStorage {
  if (!defaultStorage) {
    defaultStorage = new HybridTokenStorage();
  }
  return defaultStorage;
}

export function resetDefaultTokenStorage(): void {
  defaultStorage = null;
}
