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
  type AnyToolInvocation,
  type PolicyUpdateOptions,
} from '../tools/tools.js';
import { buildFilePathArgsPattern } from '../policy/utils.js';
import { makeRelative } from '../utils/paths.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import { EDIT_TOOL_NAMES } from '../tools/tool-names.js';
import type { ValidatingToolCall } from './types.js';

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

  const toolAnnotations = toolCall.tool.toolAnnotations;

  const result = await config
    .getPolicyEngine()
    .check(
      { name: toolCall.request.name, args: toolCall.request.args },
      serverName,
      toolAnnotations,
    );

  const { decision } = result;

  // If the tool call was initiated by the client (e.g. via a slash command),
  // we treat it as implicitly confirmed by the user and bypass the
  // confirmation prompt if the policy engine's decision is 'ASK_USER'.
  if (
    decision === PolicyDecision.ASK_USER &&
    toolCall.request.isClientInitiated
  ) {
    return {
      decision: PolicyDecision.ALLOW,
      rule: result.rule,
    };
  }

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

  return {
    decision,
    rule: result.rule,
  };
}

/**
 * Evaluates the outcome of a user confirmation and dispatches
 * policy config updates.
 */
export async function updatePolicy(
  tool: AnyDeclarativeTool,
  outcome: ToolConfirmationOutcome,
  confirmationDetails: SerializableConfirmationDetails | undefined,
  deps: {
    config: Config;
    messageBus: MessageBus;
    toolInvocation?: AnyToolInvocation;
  },
): Promise<void> {
  // Mode Transitions (AUTO_EDIT)
  if (isAutoEditTransition(tool, outcome)) {
    deps.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
    return;
  }

  // Determine persist scope if we are persisting.
  let persistScope: 'workspace' | 'user' | undefined;
  if (outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave) {
    // If folder is trusted and workspace policies are enabled, we prefer workspace scope.
    if (
      deps.config.isTrustedFolder() &&
      deps.config.getWorkspacePoliciesDir() !== undefined
    ) {
      persistScope = 'workspace';
    } else {
      persistScope = 'user';
    }
  }

  // Specialized Tools (MCP)
  if (confirmationDetails?.type === 'mcp') {
    await handleMcpPolicyUpdate(
      tool,
      outcome,
      confirmationDetails,
      deps.messageBus,
      persistScope,
    );
    return;
  }

  // Generic Fallback (Shell, Info, etc.)
  await handleStandardPolicyUpdate(
    tool,
    outcome,
    confirmationDetails,
    deps.messageBus,
    persistScope,
    deps.toolInvocation,
    deps.config,
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

/**
 * Handles policy updates for standard tools (Shell, Info, etc.), including
 * session-level and persistent approvals.
 */
async function handleStandardPolicyUpdate(
  tool: AnyDeclarativeTool,
  outcome: ToolConfirmationOutcome,
  confirmationDetails: SerializableConfirmationDetails | undefined,
  messageBus: MessageBus,
  persistScope?: 'workspace' | 'user',
  toolInvocation?: AnyToolInvocation,
  config?: Config,
): Promise<void> {
  if (
    outcome === ToolConfirmationOutcome.ProceedAlways ||
    outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave
  ) {
    const options: PolicyUpdateOptions =
      toolInvocation?.getPolicyUpdateOptions?.(outcome) || {};

    if (!options.commandPrefix && confirmationDetails?.type === 'exec') {
      options.commandPrefix = confirmationDetails.rootCommands;
    } else if (!options.argsPattern && confirmationDetails?.type === 'edit') {
      const filePath = config
        ? makeRelative(confirmationDetails.filePath, config.getTargetDir())
        : confirmationDetails.filePath;
      options.argsPattern = buildFilePathArgsPattern(filePath);
    }

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: tool.name,
      persist: outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave,
      persistScope,
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
  persistScope?: 'workspace' | 'user',
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
    persistScope,
  });
}
