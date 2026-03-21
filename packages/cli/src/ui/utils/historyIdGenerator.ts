/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Initialize with Date.now() * 10 so it's strictly larger than old
// IDs and we stay within Number.MAX_SAFE_INTEGER (which is ~9e15, while Date.now() * 10 is ~1.7e13).
let globalHistoryIdCounter = Date.now() * 10;

/**
 * Returns a strictly monotonic, globally unique ID for history items.
 *
 * This ensures that when history items are updated from multiple asynchronous
 * sources (e.g., slash commands, Gemini streaming, tools), they can be reliably
 * sorted to prevent ordering corruption and race conditions.
 */
export function getNextHistoryId(): number {
  return ++globalHistoryIdCounter;
}
