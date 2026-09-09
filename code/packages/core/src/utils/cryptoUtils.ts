/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';

/**
 * Derives a stable, deterministic ID from a list of source IDs.
 * Used for synthetic turns like summaries to ensure that re-summarizing the same
 * content produces a consistent identity.
 */
export function deriveStableId(sourceIds: string[]): string {
  const sortedIds = [...sourceIds].sort();
  return createHash('sha256')
    .update(sortedIds.join('|'))
    .digest('hex')
    .slice(0, 32);
}
