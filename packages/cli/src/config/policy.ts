/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type PolicyEngineConfig,
  PolicyDecision,
  type PolicyRule,
  ApprovalMode,
} from '@google/gemini-cli-core';
import type { Settings } from './settings.js';

// READ_ONLY_TOOLS is a list of built-in tools that do not modify the user's
// files or system state.
const READ_ONLY_TOOLS = new Set([
  'glob',
  'search_file_content',
  'list_directory',
  'read_file',
  'read_many_files',
  'google_web_search',
]);

// WRITE_TOOLS is a list of built-in tools that can modify the user's files or
// system state. These tools have a shouldConfirmExecute method.
// We are keeping this here for visibility and to maintain backwards compatibility
// with the existing tool permissions system. Eventually we'll remove this and
// any tool that isn't read only will require a confirmation unless altered by
// config and policy.
const WRITE_TOOLS = new Set([
  'replace',
  'save_memory',
  'run_shell_command',
  'write_file',
  'web_fetch',
]);

export function createPolicyEngineConfig(
  settings: Settings,
  approvalMode: ApprovalMode,
): PolicyEngineConfig {
  const rules: PolicyRule[] = [];

  // Tools that are explicitly allowed in the settings.
  // Priority: 100
  if (settings.tools?.allowed) {
    for (const tool of settings.tools.allowed) {
      rules.push({
        toolName: tool,
        decision: PolicyDecision.ALLOW,
        priority: 100,
      });
    }
  }

  // MCP servers that are explicitly allowed in the settings.
  // Priority: 100
  if (settings.mcp?.allowed) {
    for (const server of settings.mcp.allowed) {
      rules.push({
        toolName: `^mcp://${server}/.*`,
        decision: PolicyDecision.ALLOW,
        priority: 100,
      });
    }
  }

  // Tools that are explicitly excluded in the settings.
  // Priority: 200
  if (settings.tools?.exclude) {
    for (const tool of settings.tools.exclude) {
      rules.push({
        toolName: tool,
        decision: PolicyDecision.DENY,
        priority: 200,
      });
    }
  }

  // MCP servers that are explicitly excluded in the settings.
  // Priority: 200
  if (settings.mcp?.excluded) {
    for (const server of settings.mcp.excluded) {
      rules.push({
        toolName: `^mcp://${server}/.*`,
        decision: PolicyDecision.DENY,
        priority: 200,
      });
    }
  }

  // If smart edit is enabled, deny the replace tool.
  if (settings.useSmartEdit) {
    rules.push({
      toolName: 'replace',
      decision: PolicyDecision.DENY,
      priority: 200,
    });
  }

  // If auto-accept is enabled, allow all read-only tools.
  // Priority: 50
  if (settings.tools?.autoAccept) {
    for (const tool of READ_ONLY_TOOLS) {
      rules.push({
        toolName: tool,
        decision: PolicyDecision.ALLOW,
        priority: 50,
      });
    }
  }

  for (const tool of WRITE_TOOLS) {
    rules.push({
      toolName: tool,
      decision: PolicyDecision.ASK_USER,
      priority: 10,
    });
  }

  if (approvalMode === ApprovalMode.YOLO) {
    rules.push({
      decision: PolicyDecision.ALLOW,
      priority: 0, // Lowest priority
    });
  } else if (approvalMode === ApprovalMode.AUTO_EDIT) {
    rules.push({
      toolName: 'edit',
      decision: PolicyDecision.ALLOW,
      priority: 10,
    });
  }

  return {
    rules,
    defaultDecision: PolicyDecision.ASK_USER,
  };
}
