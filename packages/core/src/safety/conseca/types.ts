/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ToolPolicy {
  permissions: 'ALLOW' | 'DENY' | 'ASK_USER';
  constraints: string;
  rationale: string;
}

/**
 * A map of tool names to their specific security policies.
 */
export type SecurityPolicy = Record<string, ToolPolicy>;
