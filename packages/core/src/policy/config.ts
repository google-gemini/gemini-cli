/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Storage } from '../config/storage.js';
import {
  type PolicyEngineConfig,
  PolicyDecision,
  type PolicyRule,
  type ApprovalMode,
  type PolicySettings,
} from './types.js';
import type { PolicyEngine } from './policy-engine.js';
import { loadPoliciesFromToml, type PolicyFileError } from './toml-loader.js';
import {
  MessageBusType,
  type UpdatePolicy,
} from '../confirmation-bus/types.js';
import { type MessageBus } from '../confirmation-bus/message-bus.js';
import { coreEvents } from '../utils/events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const DEFAULT_CORE_POLICIES_DIR = path.join(__dirname, 'policies');

// Policy tier constants for priority calculation
export const DEFAULT_POLICY_TIER = 1;
export const USER_POLICY_TIER = 2;
export const ADMIN_POLICY_TIER = 3;

/**
 * Gets the list of directories to search for policy files, in order of increasing priority
 * (Default -> User -> Admin).
 *
 * @param defaultPoliciesDir Optional path to a directory containing default policies.
 */
export function getPolicyDirectories(defaultPoliciesDir?: string): string[] {
  const dirs = [];

  if (defaultPoliciesDir) {
    dirs.push(defaultPoliciesDir);
  } else {
    dirs.push(DEFAULT_CORE_POLICIES_DIR);
  }

  dirs.push(Storage.getUserPoliciesDir());
  dirs.push(Storage.getSystemPoliciesDir());

  // Reverse so highest priority (Admin) is first for loading order if needed,
  // though loadPoliciesFromToml might want them in a specific order.
  // CLI implementation reversed them: [DEFAULT, USER, ADMIN].reverse() -> [ADMIN, USER, DEFAULT]
  return dirs.reverse();
}

/**
 * Determines the policy tier (1=default, 2=user, 3=admin) for a given directory.
 * This is used by the TOML loader to assign priority bands.
 */
export function getPolicyTier(
  dir: string,
  defaultPoliciesDir?: string,
): number {
  const USER_POLICIES_DIR = Storage.getUserPoliciesDir();
  const ADMIN_POLICIES_DIR = Storage.getSystemPoliciesDir();

  const normalizedDir = path.resolve(dir);
  const normalizedUser = path.resolve(USER_POLICIES_DIR);
  const normalizedAdmin = path.resolve(ADMIN_POLICIES_DIR);

  if (
    defaultPoliciesDir &&
    normalizedDir === path.resolve(defaultPoliciesDir)
  ) {
    return DEFAULT_POLICY_TIER;
  }
  if (normalizedDir === path.resolve(DEFAULT_CORE_POLICIES_DIR)) {
    return DEFAULT_POLICY_TIER;
  }
  if (normalizedDir === normalizedUser) {
    return USER_POLICY_TIER;
  }
  if (normalizedDir === normalizedAdmin) {
    return ADMIN_POLICY_TIER;
  }

  return DEFAULT_POLICY_TIER;
}

/**
 * Formats a policy file error for console logging.
 */
export function formatPolicyError(error: PolicyFileError): string {
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
  settings: PolicySettings,
  approvalMode: ApprovalMode,
  defaultPoliciesDir?: string,
): Promise<PolicyEngineConfig> {
  const policyDirs = getPolicyDirectories(defaultPoliciesDir);

  // Load policies from TOML files
  const { rules: tomlRules, errors } = await loadPoliciesFromToml(
    approvalMode,
    policyDirs,
    (dir) => getPolicyTier(dir, defaultPoliciesDir),
  );

  // Emit any errors encountered during TOML loading to the UI
  // coreEvents has a buffer that will display these once the UI is ready
  if (errors.length > 0) {
    for (const error of errors) {
      coreEvents.emitFeedback('error', formatPolicyError(error));
    }
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
