/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ideContext } from '../ide/ideContext.js';

/**
 * Gets the workspace trust from the IDE if available.
 * @returns A boolean if the IDE provides a trust value, otherwise undefined.
 */
export function getIdeTrust(): boolean | undefined {
  return ideContext.getIdeContext()?.workspaceState?.isTrusted;
}
