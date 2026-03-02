/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

/**
 * Zod schema for MCPServerConfig.
 */
export const MCPServerConfigSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  trust: z.boolean().optional(),
  alwaysAllowTools: z.array(z.string()).optional(),
  includeTools: z.array(z.string()).optional(),
  excludeTools: z.array(z.string()).optional(),
  targetAudience: z.string().optional(),
  targetServiceAccount: z.string().optional(),
  visibility: z.enum(['public', 'private']).optional(),
});

/**
 * Zod schema for PolicySettings.
 */
export const PolicySettingsSchema = z.object({
  mcp: z
    .object({
      excluded: z.array(z.string()).optional(),
      allowed: z.array(z.string()).optional(),
    })
    .optional(),
  tools: z
    .object({
      exclude: z.array(z.string()).optional(),
      allowed: z.array(z.string()).optional(),
    })
    .optional(),
  mcpServers: z.record(z.object({ trust: z.boolean().optional() })).optional(),
  policyPaths: z.array(z.string()).optional(),
  workspacePoliciesDir: z.string().optional(),
});

export const MCPServersConfigSchema = z.record(MCPServerConfigSchema);
