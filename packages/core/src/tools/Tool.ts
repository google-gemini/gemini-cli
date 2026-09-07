/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Capability } from '../permissions/Capability.js';
import type { PermissionManager } from '../permissions/PermissionManager.js';

export interface ToolContext {
  workspaceRoot: string;
  permissions: PermissionManager;
  abortSignal?: AbortSignal;
}

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required?: boolean;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly capability: Capability;
  readonly parameters: Record<string, ToolParameter>;
  execute(args: Record<string, unknown>, context: ToolContext): Promise<string>;
}
