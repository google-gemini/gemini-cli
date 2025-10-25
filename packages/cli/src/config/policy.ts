/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type PolicyEngineConfig,
  PolicyDecision,
  type PolicyRule,
  type ApprovalMode,
  type PolicyEngine,
  type MessageBus,
  MessageBusType,
  type UpdatePolicy,
  Storage,
} from '@google/gemini-cli-core';
import { type Settings, getSystemSettingsPath } from './settings.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadPoliciesFromToml,
  type PolicyFileError,
} from './policy-toml-loader.js';

// Get the directory name of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getPolicyDirectories(): string[] {
  const DEFAULT_POLICIES_DIR = path.resolve(__dirname, 'policies');
  const USER_POLICIES_DIR = Storage.getUserPoliciesDir();
  const systemSettingsPath = getSystemSettingsPath();
  const ADMIN_POLICIES_DIR = path.join(
    path.dirname(systemSettingsPath),
    'policies',
  );

  return [
    DEFAULT_POLICIES_DIR,
    USER_POLICIES_DIR,
    ADMIN_POLICIES_DIR,
  ].reverse();
}

/**
 * Determines the policy tier (1=default, 2=user, 3=admin) for a given directory.
 * This is used by the TOML loader to assign priority bands.
 */
function getPolicyTier(dir: string): number {
  const DEFAULT_POLICIES_DIR = path.resolve(__dirname, 'policies');
  const USER_POLICIES_DIR = Storage.getUserPoliciesDir();
  const systemSettingsPath = getSystemSettingsPath();
  const ADMIN_POLICIES_DIR = path.join(
    path.dirname(systemSettingsPath),
    'policies',
  );

  // Normalize paths for comparison
  const normalizedDir = path.resolve(dir);
  const normalizedDefault = path.resolve(DEFAULT_POLICIES_DIR);
  const normalizedUser = path.resolve(USER_POLICIES_DIR);
  const normalizedAdmin = path.resolve(ADMIN_POLICIES_DIR);

  if (normalizedDir === normalizedDefault) return 1;
  if (normalizedDir === normalizedUser) return 2;
  if (normalizedDir === normalizedAdmin) return 3;

  // Default to tier 1 if unknown
  return 1;
}

/**
 * Formats a policy file error for console logging.
 */
function formatPolicyError(error: PolicyFileError): string {
  const tierLabel = error.tier.toUpperCase();
  let message = `[${tierLabel}] Policy file error in ${error.fileName}:\n`;
  message += `  ${error.message}`;
  if (error.details) {
    message += `\n${error.details}`;
  }
  if (error.suggestion) {
    message += `\n  Suggestion: ${error.suggestion}`;
  }
  return message;
}

export async function createPolicyEngineConfig(
  settings: Settings,
  approvalMode: ApprovalMode,
): Promise<PolicyEngineConfig> {
  const policyDirs = getPolicyDirectories();

  // Load policies from TOML files
  const { rules: tomlRules, errors } = await loadPoliciesFromToml(
    approvalMode,
    policyDirs,
    getPolicyTier,
  );

  // Log any errors encountered during TOML loading
  if (errors.length > 0) {
    console.error('\nPolicy file errors:');
    for (const error of errors) {
      console.error(formatPolicyError(error));
    }
    console.error('');
  }

  const rules: PolicyRule[] = [...tomlRules];

  // Priority system for policy rules:
  // - Higher priority numbers win over lower priority numbers
  // - When multiple rules match, the highest priority rule is applied
  // - Rules are evaluated in order of priority (highest first)
  //
  // Priority bands (tiers):
  // - Default policies (TOML): 1 + priority/1000 (e.g., priority 100 → 1.100)
  // - User policies (TOML): 2 + priority/1000 (e.g., priority 100 → 2.100)
  // - Admin policies (TOML): 3 + priority/1000 (e.g., priority 100 → 3.100)
  //
  // This ensures Admin > User > Default hierarchy is always preserved,
  // while allowing user-specified priorities to work within each tier.
  //
  // Settings-based and dynamic rules (all in user tier 2.x):
  //   2.95: Tools that the user has selected as "Always Allow" in the interactive UI
  //   2.9:  MCP servers excluded list (security: persistent server blocks)
  //   2.4:  Command line flag --exclude-tools (explicit temporary blocks)
  //   2.3:  Command line flag --allowed-tools (explicit temporary allows)
  //   2.2:  MCP servers with trust=true (persistent trusted servers)
  //   2.1:  MCP servers allowed list (persistent general server allows)
  //
  // TOML policy priorities (before transformation):
  //   10: Write tools default to ASK_USER (becomes 1.010 in default tier)
  //   15: Auto-edit tool override (becomes 1.015 in default tier)
  //   50: Read-only tools (becomes 1.050 in default tier)
  //   999: YOLO mode allow-all (becomes 1.999 in default tier)

  // MCP servers that are explicitly excluded in settings.mcp.excluded
  // Priority: 2.9 (highest in user tier for security - persistent server blocks)
  if (settings.mcp?.excluded) {
    for (const serverName of settings.mcp.excluded) {
      rules.push({
        toolName: `${serverName}__*`,
        decision: PolicyDecision.DENY,
        priority: 2.9,
      });
    }
  }

  // Tools that are explicitly excluded in the settings.
  // Priority: 2.4 (user tier - explicit temporary blocks)
  if (settings.tools?.exclude) {
    for (const tool of settings.tools.exclude) {
      rules.push({
        toolName: tool,
        decision: PolicyDecision.DENY,
        priority: 2.4,
      });
    }
  }

  // Tools that are explicitly allowed in the settings.
  // Priority: 2.3 (user tier - explicit temporary allows)
  if (settings.tools?.allowed) {
    for (const tool of settings.tools.allowed) {
      rules.push({
        toolName: tool,
        decision: PolicyDecision.ALLOW,
        priority: 2.3,
      });
    }
  }

  // MCP servers that are trusted in the settings.
  // Priority: 2.2 (user tier - persistent trusted servers)
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
          priority: 2.2,
        });
      }
    }
  }

  // MCP servers that are explicitly allowed in settings.mcp.allowed
  // Priority: 2.1 (user tier - persistent general server allows)
  if (settings.mcp?.allowed) {
    for (const serverName of settings.mcp.allowed) {
      rules.push({
        toolName: `${serverName}__*`,
        decision: PolicyDecision.ALLOW,
        priority: 2.1,
      });
    }
  }

  return {
    rules,
    defaultDecision: PolicyDecision.ASK_USER,
  };
}

export function createPolicyUpdater(
  policyEngine: PolicyEngine,
  messageBus: MessageBus,
) {
  messageBus.subscribe(
    MessageBusType.UPDATE_POLICY,
    (message: UpdatePolicy) => {
      const toolName = message.toolName;

      policyEngine.addRule({
        toolName,
        decision: PolicyDecision.ALLOW,
        // User tier (2) + high priority (950/1000) = 2.95
        // This ensures user "always allow" selections are high priority
        // but still lose to admin policies (3.xxx) and settings excludes (200)
        priority: 2.95,
      });
    },
  );
}
