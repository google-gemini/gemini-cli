/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolErrorType } from '../tools/tool-error.js';
import {
  ApprovalMode,
  PolicyDecision,
  type CheckResult,
  type PolicyRule,
} from '../policy/types.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  MessageBusType,
  type SerializableConfirmationDetails,
} from '../confirmation-bus/types.js';
import {
  ToolConfirmationOutcome,
  type AnyDeclarativeTool,
  type PolicyUpdateOptions,
  type ToolConfirmationPayload,
  type ToolScopeConfirmationPayload,
  type ApprovalScope,
} from '../tools/tools.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import { EDIT_TOOL_NAMES } from '../tools/tool-names.js';
import type { ValidatingToolCall } from './types.js';
import {
  parseCommand,
  shouldPersist as shouldPersistCommand,
} from '../policy/scope-generator.js';

/**
 * Helper to format the policy denial error.
 */
export function getPolicyDenialError(
  config: Config,
  rule?: PolicyRule,
): { errorMessage: string; errorType: ToolErrorType } {
  const denyMessage = rule?.denyMessage ? ` ${rule.denyMessage}` : '';
  return {
    errorMessage: `Tool execution denied by policy.${denyMessage}`,
    errorType: ToolErrorType.POLICY_VIOLATION,
  };
}

/**
 * Queries the system PolicyEngine to determine tool allowance.
 * @returns The PolicyDecision.
 * @throws Error if policy requires ASK_USER but the CLI is non-interactive.
 */
export async function checkPolicy(
  toolCall: ValidatingToolCall,
  config: Config,
): Promise<CheckResult> {
  const serverName =
    toolCall.tool instanceof DiscoveredMCPTool
      ? toolCall.tool.serverName
      : undefined;

  const result = await config
    .getPolicyEngine()
    .check(
      { name: toolCall.request.name, args: toolCall.request.args },
      serverName,
    );

  const { decision } = result;

  /*
   * Return the full check result including the rule that matched.
   * This is necessary to access metadata like custom deny messages.
   */
  if (decision === PolicyDecision.ASK_USER) {
    if (!config.isInteractive()) {
      throw new Error(
        `Tool execution for "${
          toolCall.tool.displayName || toolCall.tool.name
        }" requires user confirmation, which is not supported in non-interactive mode.`,
      );
    }
  }

  return { decision, rule: result.rule };
}

/**
 * Evaluates the outcome of a user confirmation and dispatches
 * policy config updates.
 */
export async function updatePolicy(
  tool: AnyDeclarativeTool,
  outcome: ToolConfirmationOutcome,
  confirmationDetails: SerializableConfirmationDetails | undefined,
  deps: { config: Config; messageBus: MessageBus },
  payload?: ToolConfirmationPayload,
): Promise<void> {
  // Mode Transitions (AUTO_EDIT)
  if (isAutoEditTransition(tool, outcome)) {
    deps.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
    return;
  }

  // Specialized Tools (MCP)
  if (confirmationDetails?.type === 'mcp') {
    await handleMcpPolicyUpdate(
      tool,
      outcome,
      confirmationDetails,
      deps.messageBus,
    );
    return;
  }

  // Generic Fallback (Shell, Info, etc.)
  await handleStandardPolicyUpdate(
    tool,
    outcome,
    confirmationDetails,
    deps.messageBus,
    payload,
  );
}

/**
 * Returns true if the user's 'Always Allow' selection for a specific tool
 * should trigger a session-wide transition to AUTO_EDIT mode.
 */
function isAutoEditTransition(
  tool: AnyDeclarativeTool,
  outcome: ToolConfirmationOutcome,
): boolean {
  // TODO: This is a temporary fix to enable AUTO_EDIT mode for specific
  // tools. We should refactor this so that callbacks can be removed from
  // tools.
  return (
    outcome === ToolConfirmationOutcome.ProceedAlways &&
    EDIT_TOOL_NAMES.has(tool.name)
  );
}

function isScopePayload(
  payload: ToolConfirmationPayload | undefined,
): payload is ToolScopeConfirmationPayload {
  return (
    payload !== undefined && ('scope' in payload || 'commandScopes' in payload)
  );
}

/**
 * Converts an approval scope and command to a command prefix string.
 * Used for building policy rules from scope selections.
 */
function scopeToCommandPrefix(
  scope: ApprovalScope,
  fullCommand: string,
): string {
  const parts = parseCommand(fullCommand);

  switch (scope) {
    case 'exact':
      return fullCommand;
    case 'command-flags':
      // 'command-flags' = binary + subcommand level
      return parts.subcommand
        ? `${parts.binary} ${parts.subcommand}`
        : parts.binary;
    case 'command-only':
      return parts.binary;
    default:
      return fullCommand;
  }
}

/**
 * Builds command prefixes for per-command scope selections (expanded mode).
 * Each command can have its own scope (exact, command-flags, command-only).
 */
function buildCommandPrefixesForPerCommandScopes(
  commandScopes: Record<string, ApprovalScope>,
): string[] {
  const prefixes: string[] = [];
  for (const [cmd, cmdScope] of Object.entries(commandScopes)) {
    prefixes.push(scopeToCommandPrefix(cmdScope, cmd));
  }
  return [...new Set(prefixes)]; // Dedupe
}

/**
 * Builds command prefixes for compound commands with a uniform scope.
 * All commands get the same scope applied.
 */
function buildCommandPrefixesForUniformScope(
  commands: string[],
  scope: ApprovalScope,
): string[] {
  const prefixes: string[] = [];
  for (const cmd of commands) {
    prefixes.push(scopeToCommandPrefix(scope, cmd));
  }
  return [...new Set(prefixes)]; // Dedupe
}

/**
 * Handles policy updates for standard tools (Shell, Info, etc.), including
 * session-level and persistent approvals.
 *
 * Supports the scope-based approval system:
 * - 'exact': Only the exact command
 * - 'command-flags': Command with same flags, any arguments
 * - 'command-only': Command with any flags/arguments
 * - 'custom': User-provided regex pattern
 */
async function handleStandardPolicyUpdate(
  tool: AnyDeclarativeTool,
  outcome: ToolConfirmationOutcome,
  confirmationDetails: SerializableConfirmationDetails | undefined,
  messageBus: MessageBus,
  payload?: ToolConfirmationPayload,
): Promise<void> {
  if (
    outcome === ToolConfirmationOutcome.ProceedAlways ||
    outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave
  ) {
    const options: PolicyUpdateOptions = {};

    if (confirmationDetails?.type === 'exec') {
      if (isScopePayload(payload)) {
        const { scope, customPattern, compoundCommands, commandScopes } =
          payload;

        // Handle per-command scopes (from expanded mode)
        if (commandScopes && Object.keys(commandScopes).length > 0) {
          options.commandPrefix =
            buildCommandPrefixesForPerCommandScopes(commandScopes);
        } else if (compoundCommands && compoundCommands.length > 1 && scope) {
          // Handle compound commands with uniform scope
          options.commandPrefix = buildCommandPrefixesForUniformScope(
            compoundCommands,
            scope,
          );
        } else if (scope) {
          // Single command with scope
          const fullCommand = confirmationDetails.command;

          if (scope === 'custom') {
            if (customPattern) {
              options.argsPattern = customPattern;
            } else {
              options.commandPrefix = [fullCommand];
            }
          } else {
            options.commandPrefix = [scopeToCommandPrefix(scope, fullCommand)];
          }
        }
      } else {
        // No scope payload provided. This happens when:
        // 1. Folder is not trusted (so scope UI is hidden)
        // 2. User clicked "Allow for this session" without selecting a scope
        // Default to 'exact' scope (most restrictive) for safety.
        options.commandPrefix = [confirmationDetails.command];
      }
    }

    let persist = outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave;

    if (isScopePayload(payload) && confirmationDetails?.type === 'exec') {
      if (payload.persist !== undefined) {
        persist = payload.persist;
      } else if (outcome === ToolConfirmationOutcome.ProceedAlways) {
        persist = shouldPersistCommand(confirmationDetails.rootCommand);
      }
    }

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: tool.name,
      persist,
      ...options,
    });
  }
}

/**
 * Handles policy updates specifically for MCP tools, including session-level
 * and persistent approvals.
 */
async function handleMcpPolicyUpdate(
  tool: AnyDeclarativeTool,
  outcome: ToolConfirmationOutcome,
  confirmationDetails: Extract<
    SerializableConfirmationDetails,
    { type: 'mcp' }
  >,
  messageBus: MessageBus,
): Promise<void> {
  const isMcpAlways =
    outcome === ToolConfirmationOutcome.ProceedAlways ||
    outcome === ToolConfirmationOutcome.ProceedAlwaysTool ||
    outcome === ToolConfirmationOutcome.ProceedAlwaysServer ||
    outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave;

  if (!isMcpAlways) {
    return;
  }

  let toolName = tool.name;
  const persist = outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave;

  // If "Always allow all tools from this server", use the wildcard pattern
  if (outcome === ToolConfirmationOutcome.ProceedAlwaysServer) {
    toolName = `${confirmationDetails.serverName}__*`;
  }

  await messageBus.publish({
    type: MessageBusType.UPDATE_POLICY,
    toolName,
    mcpName: confirmationDetails.serverName,
    persist,
  });
}
