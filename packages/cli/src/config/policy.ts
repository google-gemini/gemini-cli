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
  // Read-only tools
  GlobTool,
  GrepTool,
  LSTool,
  ReadFileTool,
  ReadManyFilesTool,
  RipGrepTool,
  // Write tools
  EditTool,
  MemoryTool,
  ShellTool,
  WriteFileTool,
  WebFetchTool,
  WebSearchTool,
} from '@google/gemini-cli-core';
import type { Settings } from './settings.js';

// READ_ONLY_TOOLS is a list of built-in tools that do not modify the user's
// files or system state.
const READ_ONLY_TOOLS = new Set([
  GlobTool.Name,
  GrepTool.Name,
  RipGrepTool.Name,
  LSTool.Name,
  ReadFileTool.Name,
  ReadManyFilesTool.Name,
  WebSearchTool.Name,
]);

// WRITE_TOOLS is a list of built-in tools that can modify the user's files or
// system state. These tools have a shouldConfirmExecute method.
// We are keeping this here for visibility and to maintain backwards compatibility
// with the existing tool permissions system. Eventually we'll remove this and
// any tool that isn't read only will require a confirmation unless altered by
// config and policy.
const WRITE_TOOLS = new Set([
  EditTool.Name,
  MemoryTool.Name,
  ShellTool.Name,
  WriteFileTool.Name,
  WebFetchTool.Name,
]);

export function createPolicyEngineConfig(
  settings: Settings,
  approvalMode: ApprovalMode,
): PolicyEngineConfig {
  const rules: PolicyRule[] = [];

  // Priority system for policy rules:
  // - Higher priority numbers win over lower priority numbers
  // - When multiple rules match, the highest priority rule is applied
  // - Rules are evaluated in order of priority (highest first)
  //
  // Priority levels used in this configuration:
  //   0: Default allow-all (YOLO mode only)
  //   10: Write tools default to ASK_USER
  //   50: Auto-accept read-only tools
  //   85: MCP servers allowed list
  //   90: MCP servers with trust=true
  //   100: Explicitly allowed individual tools
  //   195: Explicitly excluded MCP servers
  //   200: Explicitly excluded individual tools (highest priority)

  // MCP servers that are explicitly allowed in settings.mcp.allowed
  // Priority: 85 (lower than trusted servers)
  if (settings.mcp?.allowed) {
    for (const serverName of settings.mcp.allowed) {
      rules.push({
        toolName: `${serverName}__*`,
        decision: PolicyDecision.ALLOW,
        priority: 85,
      });
    }
  }

  // MCP servers that are trusted in the settings.
  // Priority: 90 (higher than general allowed servers but lower than explicit tool allows)
  if (settings.mcpServers) {
    for (const [serverName, serverConfig] of Object.entries(
      settings.mcpServers,
    )) {
      if (serverConfig.trust) {
        // Trust all tools from this MCP server
        // Using pattern matching for MCP tool names which are formatted as "serverName__toolName"
        rules.push({
          toolName: `${serverName}__*`,
          decision: PolicyDecision.ALLOW,
          priority: 90,
        });
      }
    }
  }

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

  // MCP servers that are explicitly excluded in settings.mcp.excluded
  // Priority: 195 (high priority to block servers)
  if (settings.mcp?.excluded) {
    for (const serverName of settings.mcp.excluded) {
      rules.push({
        toolName: `${serverName}__*`,
        decision: PolicyDecision.DENY,
        priority: 195,
      });
    }
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

  // Only add write tool rules if not in YOLO mode
  // In YOLO mode, the wildcard ALLOW rule handles everything
  if (approvalMode !== ApprovalMode.YOLO) {
    for (const tool of WRITE_TOOLS) {
      rules.push({
        toolName: tool,
        decision: PolicyDecision.ASK_USER,
        priority: 10,
      });
    }
  }

  if (approvalMode === ApprovalMode.YOLO) {
    rules.push({
      decision: PolicyDecision.ALLOW,
      priority: 0, // Lowest priority - catches everything not explicitly configured
    });
  } else if (approvalMode === ApprovalMode.AUTO_EDIT) {
    rules.push({
      toolName: EditTool.Name,
      decision: PolicyDecision.ALLOW,
      priority: 15, // Higher than write tools (10) to override ASK_USER
    });
  }

  return {
    rules,
    defaultDecision: PolicyDecision.ASK_USER,
  };
}
