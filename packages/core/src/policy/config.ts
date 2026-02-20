/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
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
import { buildArgsPatterns, isSafeRegExp } from './utils.js';
import toml from '@iarna/toml';
import {
  MessageBusType,
  type UpdatePolicy,
} from '../confirmation-bus/types.js';
import { type MessageBus } from '../confirmation-bus/message-bus.js';
import { coreEvents } from '../utils/events.js';
import { debugLogger } from '../utils/debugLogger.js';
import { SHELL_TOOL_NAMES } from '../utils/shell-utils.js';
import { SHELL_TOOL_NAME } from '../tools/tool-names.js';
import { isNodeError } from '../utils/errors.js';

import { isDirectorySecure } from '../utils/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const DEFAULT_CORE_POLICIES_DIR = path.join(__dirname, 'policies');

// Policy tier constants for priority calculation
export const DEFAULT_POLICY_TIER = 1;
export const WORKSPACE_POLICY_TIER = 2;
export const USER_POLICY_TIER = 3;
export const ADMIN_POLICY_TIER = 4;

// Specific priority offsets and derived priorities for dynamic/settings rules.
// These are added to the tier base (e.g., USER_POLICY_TIER).

// Workspace tier (2) + high priority (950/1000) = ALWAYS_ALLOW_PRIORITY
// This ensures user "always allow" selections are high priority
// within the workspace tier but still lose to user/admin policies.
export const ALWAYS_ALLOW_PRIORITY = WORKSPACE_POLICY_TIER + 0.95;

export const MCP_EXCLUDED_PRIORITY = USER_POLICY_TIER + 0.9;
export const EXCLUDE_TOOLS_FLAG_PRIORITY = USER_POLICY_TIER + 0.4;
export const ALLOWED_TOOLS_FLAG_PRIORITY = USER_POLICY_TIER + 0.3;
export const TRUSTED_MCP_SERVER_PRIORITY = USER_POLICY_TIER + 0.2;
export const ALLOWED_MCP_SERVER_PRIORITY = USER_POLICY_TIER + 0.1;

/**
 * Gets the list of directories to search for policy files, in order of increasing priority
 * (Default -> User -> Project -> Admin).
 *
 * @param defaultPoliciesDir Optional path to a directory containing default policies.
 * @param policyPaths Optional user-provided policy paths (from --policy flag).
 *   When provided, these replace the default user policies directory.
 * @param workspacePoliciesDir Optional path to a directory containing workspace policies.
 */
export function getPolicyDirectories(
  defaultPoliciesDir?: string,
  policyPaths?: string[],
  workspacePoliciesDir?: string,
): string[] {
  const dirs = [];

  // Admin tier (highest priority)
  dirs.push(Storage.getSystemPoliciesDir());

  // User tier (second highest priority)
  if (policyPaths && policyPaths.length > 0) {
    dirs.push(...policyPaths);
  } else {
    dirs.push(Storage.getUserPoliciesDir());
  }

  // Workspace Tier (third highest)
  if (workspacePoliciesDir) {
    dirs.push(workspacePoliciesDir);
  }

  // Default tier (lowest priority)
  dirs.push(defaultPoliciesDir ?? DEFAULT_CORE_POLICIES_DIR);

  return dirs;
}

/**
 * Determines the policy tier (1=default, 2=user, 3=workspace, 4=admin) for a given directory.
 * This is used by the TOML loader to assign priority bands.
 */
export function getPolicyTier(
  dir: string,
  defaultPoliciesDir?: string,
  workspacePoliciesDir?: string,
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
  if (
    workspacePoliciesDir &&
    normalizedDir === path.resolve(workspacePoliciesDir)
  ) {
    return WORKSPACE_POLICY_TIER;
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

/**
 * Filters out insecure policy directories (specifically the system policy directory).
 * Emits warnings if insecure directories are found.
 */
async function filterSecurePolicyDirectories(
  dirs: string[],
): Promise<string[]> {
  const systemPoliciesDir = path.resolve(Storage.getSystemPoliciesDir());

  const results = await Promise.all(
    dirs.map(async (dir) => {
      // Only check security for system policies
      if (path.resolve(dir) === systemPoliciesDir) {
        const { secure, reason } = await isDirectorySecure(dir);
        if (!secure) {
          const msg = `Security Warning: Skipping system policies from ${dir}: ${reason}`;
          coreEvents.emitFeedback('warning', msg);
          return null;
        }
      }
      return dir;
    }),
  );

  return results.filter((dir): dir is string => dir !== null);
}

export async function createPolicyEngineConfig(
  settings: PolicySettings,
  approvalMode: ApprovalMode,
  defaultPoliciesDir?: string,
): Promise<PolicyEngineConfig> {
  const policyDirs = getPolicyDirectories(
    defaultPoliciesDir,
    settings.policyPaths,
    settings.workspacePoliciesDir,
  );
  const securePolicyDirs = await filterSecurePolicyDirectories(policyDirs);

  const normalizedAdminPoliciesDir = path.resolve(
    Storage.getSystemPoliciesDir(),
  );

  // Load policies from TOML files
  const {
    rules: tomlRules,
    checkers: tomlCheckers,
    errors,
  } = await loadPoliciesFromToml(securePolicyDirs, (p) => {
    const tier = getPolicyTier(
      p,
      defaultPoliciesDir,
      settings.workspacePoliciesDir,
    );

    // If it's a user-provided path that isn't already categorized as ADMIN,
    // treat it as USER tier.
    if (
      settings.policyPaths?.some(
        (userPath) => path.resolve(userPath) === path.resolve(p),
      )
    ) {
      const normalizedPath = path.resolve(p);
      if (normalizedPath !== normalizedAdminPoliciesDir) {
        return USER_POLICY_TIER;
      }
    }

    return tier;
  });

  // Emit any errors encountered during TOML loading to the UI
  // coreEvents has a buffer that will display these once the UI is ready
  if (errors.length > 0) {
    for (const error of errors) {
      coreEvents.emitFeedback('error', formatPolicyError(error));
    }
  }

  const rules: PolicyRule[] = [...tomlRules];
  const checkers = [...tomlCheckers];

  // Priority system for policy rules:
  // - Higher priority numbers win over lower priority numbers
  // - When multiple rules match, the highest priority rule is applied
  // - Rules are evaluated in order of priority (highest first)
  //
  // Priority bands (tiers):
  // - Default policies (TOML): 1 + priority/1000 (e.g., priority 100 → 1.100)
  // - Workspace policies (TOML): 2 + priority/1000 (e.g., priority 100 → 2.100)
  // - User policies (TOML): 3 + priority/1000 (e.g., priority 100 → 3.100)
  // - Admin policies (TOML): 4 + priority/1000 (e.g., priority 100 → 4.100)
  //
  // This ensures Admin > User > Workspace > Default hierarchy is always preserved,
  // while allowing user-specified priorities to work within each tier.
  //
  // Settings-based and dynamic rules (mixed tiers):
  //   MCP_EXCLUDED_PRIORITY:        MCP servers excluded list (security: persistent server blocks)
  //   EXCLUDE_TOOLS_FLAG_PRIORITY:  Command line flag --exclude-tools (explicit temporary blocks)
  //   ALLOWED_TOOLS_FLAG_PRIORITY:  Command line flag --allowed-tools (explicit temporary allows)
  //   TRUSTED_MCP_SERVER_PRIORITY:  MCP servers with trust=true (persistent trusted servers)
  //   ALLOWED_MCP_SERVER_PRIORITY:  MCP servers allowed list (persistent general server allows)
  //   ALWAYS_ALLOW_PRIORITY:        Tools that the user has selected as "Always Allow" in the interactive UI
  //                                 (Workspace tier 2.x - scoped to the project)
  //
  // TOML policy priorities (before transformation):
  //   10: Write tools default to ASK_USER (becomes 1.010 in default tier)
  //   15: Auto-edit tool override (becomes 1.015 in default tier)
  //   50: Read-only tools (becomes 1.050 in default tier)
  //   60: Plan mode catch-all DENY override (becomes 1.060 in default tier)
  //   70: Plan mode explicit ALLOW override (becomes 1.070 in default tier)
  //   999: YOLO mode allow-all (becomes 1.999 in default tier)

  // MCP servers that are explicitly excluded in settings.mcp.excluded
  // Priority: MCP_EXCLUDED_PRIORITY (highest in user tier for security - persistent server blocks)
  if (settings.mcp?.excluded) {
    for (const serverName of settings.mcp.excluded) {
      rules.push({
        toolName: `${serverName}__*`,
        decision: PolicyDecision.DENY,
        priority: MCP_EXCLUDED_PRIORITY,
        source: 'Settings (MCP Excluded)',
      });
    }
  }

  // Tools that are explicitly excluded in the settings.
  // Priority: EXCLUDE_TOOLS_FLAG_PRIORITY (user tier - explicit temporary blocks)
  if (settings.tools?.exclude) {
    for (const tool of settings.tools.exclude) {
      rules.push({
        toolName: tool,
        decision: PolicyDecision.DENY,
        priority: EXCLUDE_TOOLS_FLAG_PRIORITY,
        source: 'Settings (Tools Excluded)',
      });
    }
  }

  // Tools that are explicitly allowed in the settings.
  // Priority: ALLOWED_TOOLS_FLAG_PRIORITY (user tier - explicit temporary allows)
  if (settings.tools?.allowed) {
    for (const tool of settings.tools.allowed) {
      // Check for legacy format: toolName(args)
      const match = tool.match(/^([a-zA-Z0-9_-]+)\((.*)\)$/);
      if (match) {
        const [, rawToolName, args] = match;
        // Normalize shell tool aliases
        const toolName = SHELL_TOOL_NAMES.includes(rawToolName)
          ? SHELL_TOOL_NAME
          : rawToolName;

        // Treat args as a command prefix for shell tool
        if (toolName === SHELL_TOOL_NAME) {
          const patterns = buildArgsPatterns(undefined, args);
          for (const pattern of patterns) {
            if (pattern) {
              rules.push({
                toolName,
                decision: PolicyDecision.ALLOW,
                priority: ALLOWED_TOOLS_FLAG_PRIORITY,
                argsPattern: new RegExp(pattern),
                source: 'Settings (Tools Allowed)',
              });
            }
          }
        } else {
          // For non-shell tools, we allow the tool itself but ignore args
          // as args matching was only supported for shell tools historically.
          rules.push({
            toolName,
            decision: PolicyDecision.ALLOW,
            priority: ALLOWED_TOOLS_FLAG_PRIORITY,
            source: 'Settings (Tools Allowed)',
          });
        }
      } else {
        // Standard tool name
        const toolName = SHELL_TOOL_NAMES.includes(tool)
          ? SHELL_TOOL_NAME
          : tool;
        rules.push({
          toolName,
          decision: PolicyDecision.ALLOW,
          priority: ALLOWED_TOOLS_FLAG_PRIORITY,
          source: 'Settings (Tools Allowed)',
        });
      }
    }
  }

  // MCP servers that are trusted in the settings.
  // Priority: TRUSTED_MCP_SERVER_PRIORITY (user tier - persistent trusted servers)
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
          priority: TRUSTED_MCP_SERVER_PRIORITY,
          source: 'Settings (MCP Trusted)',
        });
      }
    }
  }

  // MCP servers that are explicitly allowed in settings.mcp.allowed
  // Priority: ALLOWED_MCP_SERVER_PRIORITY (user tier - persistent general server allows)
  if (settings.mcp?.allowed) {
    for (const serverName of settings.mcp.allowed) {
      rules.push({
        toolName: `${serverName}__*`,
        decision: PolicyDecision.ALLOW,
        priority: ALLOWED_MCP_SERVER_PRIORITY,
        source: 'Settings (MCP Allowed)',
      });
    }
  }

  return {
    rules,
    checkers,
    defaultDecision: PolicyDecision.ASK_USER,
    approvalMode,
  };
}

interface TomlRule {
  toolName?: string;
  mcpName?: string;
  decision?: string;
  priority?: number;
  commandPrefix?: string | string[];
  argsPattern?: string;
  // Index signature to satisfy Record type if needed for toml.stringify
  [key: string]: unknown;
}

export function createPolicyUpdater(
  policyEngine: PolicyEngine,
  messageBus: MessageBus,
  storage: Storage,
) {
  // Use a sequential queue for persistence to avoid lost updates from concurrent events.
  let persistenceQueue = Promise.resolve();

  messageBus.subscribe(
    MessageBusType.UPDATE_POLICY,
    async (message: UpdatePolicy) => {
      const toolName = message.toolName;

      if (message.commandPrefix) {
        // Convert commandPrefix(es) to argsPatterns for in-memory rules
        const patterns = buildArgsPatterns(undefined, message.commandPrefix);
        for (const pattern of patterns) {
          if (pattern) {
            // Note: patterns from buildArgsPatterns are derived from escapeRegex,
            // which is safe and won't contain ReDoS patterns.
            policyEngine.addRule({
              toolName,
              decision: PolicyDecision.ALLOW,
              priority: ALWAYS_ALLOW_PRIORITY,
              argsPattern: new RegExp(pattern),
              source: 'Dynamic (Confirmed)',
            });
          }
        }
      } else {
        if (message.argsPattern && !isSafeRegExp(message.argsPattern)) {
          coreEvents.emitFeedback(
            'error',
            `Invalid or unsafe regular expression for tool ${toolName}: ${message.argsPattern}`,
          );
          return;
        }

        const argsPattern = message.argsPattern
          ? new RegExp(message.argsPattern)
          : undefined;

        policyEngine.addRule({
          toolName,
          decision: PolicyDecision.ALLOW,
          priority: ALWAYS_ALLOW_PRIORITY,
          argsPattern,
          source: 'Dynamic (Confirmed)',
        });
      }

      if (message.persist) {
        persistenceQueue = persistenceQueue.then(async () => {
          try {
            const workspacePoliciesDir = storage.getWorkspacePoliciesDir();
            await fs.mkdir(workspacePoliciesDir, { recursive: true });
            const policyFile = storage.getAutoSavedPolicyPath();

            // Read existing file
            let existingData: { rule?: TomlRule[] } = {};
            try {
              const fileContent = await fs.readFile(policyFile, 'utf-8');
              const parsed = toml.parse(fileContent);
              if (
                typeof parsed === 'object' &&
                parsed !== null &&
                (!('rule' in parsed) || Array.isArray(parsed['rule']))
              ) {
                existingData = parsed as { rule?: TomlRule[] };
              }
            } catch (error) {
              if (!isNodeError(error) || error.code !== 'ENOENT') {
                debugLogger.warn(
                  `Failed to parse ${policyFile}, overwriting with new policy.`,
                  error,
                );
              }
            }

            // Initialize rule array if needed
            if (!existingData.rule) {
              existingData.rule = [];
            }

            // Create new rule object
            const newRule: TomlRule = {};

            if (message.mcpName) {
              newRule.mcpName = message.mcpName;
              // Extract simple tool name
              const simpleToolName = toolName.startsWith(`${message.mcpName}__`)
                ? toolName.slice(message.mcpName.length + 2)
                : toolName;
              newRule.toolName = simpleToolName;
              newRule.decision = 'allow';
              newRule.priority = 200;
            } else {
              newRule.toolName = toolName;
              newRule.decision = 'allow';
              newRule.priority = 100;
            }

            if (message.commandPrefix) {
              newRule.commandPrefix = message.commandPrefix;
            } else if (message.argsPattern) {
              // message.argsPattern was already validated above
              newRule.argsPattern = message.argsPattern;
            }

            // Add to rules
            existingData.rule.push(newRule);

            // Serialize back to TOML
            // @iarna/toml stringify might not produce beautiful output but it handles escaping correctly
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const newContent = toml.stringify(existingData as toml.JsonMap);

            // Atomic write: write to a unique tmp file then rename to the target file.
            // Using a unique suffix avoids race conditions where concurrent processes
            // overwrite each other's temporary files, leading to ENOENT errors on rename.
            const tmpSuffix = crypto.randomBytes(8).toString('hex');
            const tmpFile = `${policyFile}.${tmpSuffix}.tmp`;

            let handle: fs.FileHandle | undefined;
            try {
              // Use 'wx' to create the file exclusively (fails if exists) for security.
              handle = await fs.open(tmpFile, 'wx');
              await handle.writeFile(newContent, 'utf-8');
            } finally {
              await handle?.close();
            }
            await fs.rename(tmpFile, policyFile);
          } catch (error) {
            coreEvents.emitFeedback(
              'error',
              `Failed to persist policy for ${toolName}`,
              error,
            );
          }
        });
      }
    },
  );
}
