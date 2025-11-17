/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type {
  CommandHistoryEntry,
  SearchQuery,
  SearchResult,
  HistoryStats,
  CommandPattern,
  ExportOptions,
} from './types.js';

export {
  CommandHistoryEngine,
  getHistoryEngine,
  resetHistoryEngine,
} from './history-engine.js';
