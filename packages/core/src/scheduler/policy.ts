/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { escapeJsonRegex } from '../policy/utils.js';
import { ToolErrorType } from '../tools/tool-error.js';
import {
  MCP_QUALIFIED_NAME_SEPARATOR,
  DiscoveredMCPTool,
} from '../tools/mcp-tool.js';
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
} from '../tools/tools.js';
import {
  EDIT_TOOL_NAMES,
  READ_FILE_TOOL_NAME,
  LS_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WRITE_TODOS_TOOL_NAME,
  GET_INTERNAL_DOCS_TOOL_NAME,
} from '../tools/tool-names.js';
import type { ValidatingToolCall } from './types.js';

interface ToolWithParams {
  params: Record<string, unknown>;
}

function hasParams(
  tool: AnyDeclarativeTool,
): tool is AnyDeclarativeTool & ToolWithParams {
  const t = tool as unknown;
  return (
    typeof t === 'object' &&
    t !== null &&
    'params' in t &&
    typeof (t as { params: unknown }).params === 'object' &&
    (t as { params: unknown }).params !== null
  );
}

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
  deps: { config: Config; messageBus: MessageBus },
): Promise<void> {
  // Mode Transitions (AUTO_EDIT)
  if (isAutoEditTransition(tool, outcome)) {
    deps.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
  }

  // Specialized Tools (MCP)
  if (confirmationDetails?.type === 'mcp') {
    await handleMcpPolicyUpdate(
      tool,
      outcome,
      confirmationDetails,
      deps.config,
      deps.messageBus,
    );
    return;
  }

  // Generic Fallback (Shell, Info, etc.)
  await handleStandardPolicyUpdate(
    tool,
    outcome,
    confirmationDetails,
    deps.config,
    deps.messageBus,
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

type SpecificityGenerator = (
  tool: AnyDeclarativeTool,
  confirmationDetails?: SerializableConfirmationDetails,
) => string | undefined;

const specificityGenerators: Record<string, SpecificityGenerator> = {
  [READ_FILE_TOOL_NAME]: (tool) => {
    if (!hasParams(tool)) return undefined;
    const filePath = tool.params['file_path'];
    if (typeof filePath !== 'string') return undefined;
    const escapedPath = escapeJsonRegex(filePath);
    return `.*"file_path":"${escapedPath}".*`;
  },
  [LS_TOOL_NAME]: (tool) => {
    if (!hasParams(tool)) return undefined;
    const dirPath = tool.params['dir_path'];
    if (typeof dirPath !== 'string') return undefined;
    const escapedPath = escapeJsonRegex(dirPath);
    return `.*"dir_path":"${escapedPath}".*`;
  },
  [GLOB_TOOL_NAME]: (tool) => specificityGenerators[LS_TOOL_NAME](tool),
  [GREP_TOOL_NAME]: (tool) => specificityGenerators[LS_TOOL_NAME](tool),
  [READ_MANY_FILES_TOOL_NAME]: (tool) => {
    if (!hasParams(tool)) return undefined;
    const include = tool.params['include'];
    if (!Array.isArray(include) || include.length === 0) return undefined;
    const lookaheads = include
      .map((p) => escapeJsonRegex(String(p)))
      .map((p) => `(?=.*"${p}")`)
      .join('');
    const pattern = `.*"include":\\[${lookaheads}.*\\].*`;

    // Limit regex length for safety
    if (pattern.length > 2048) {
      return '.*"include":\\[.*\\].*';
    }

    return pattern;
  },
  [WEB_FETCH_TOOL_NAME]: (tool) => {
    if (!hasParams(tool)) return undefined;
    const url = tool.params['url'];
    if (typeof url === 'string') {
      const escaped = escapeJsonRegex(url);
      return `.*"url":"${escaped}".*`;
    }

    const prompt = tool.params['prompt'];
    if (typeof prompt !== 'string') return undefined;
    const urlMatches = prompt.matchAll(/https?:\/\/[^\s"']+/g);
    const urls = Array.from(urlMatches)
      .map((m) => m[0])
      .slice(0, 3);
    if (urls.length === 0) return undefined;
    const lookaheads = urls
      .map((u) => escapeJsonRegex(u))
      .map((u) => `(?=.*${u})`)
      .join('');
    return `.*${lookaheads}.*`;
  },
  [WEB_SEARCH_TOOL_NAME]: (tool) => {
    if (!hasParams(tool)) return undefined;
    const query = tool.params['query'];
    if (typeof query === 'string') {
      const escaped = escapeJsonRegex(query);
      return `.*"query":"${escaped}".*`;
    }
    // Fallback to a pattern that matches any arguments
    // but isn't just ".*" to satisfy the auto-add safeguard.
    return '\\{.*\\}';
  },
  [WRITE_TODOS_TOOL_NAME]: (tool) => {
    if (!hasParams(tool)) return undefined;
    const todos = tool.params['todos'];
    if (!Array.isArray(todos)) return undefined;
    const escaped = todos
      .filter(
        (v): v is { description: string } => typeof v?.description === 'string',
      )
      .map((v) => escapeJsonRegex(v.description))
      .join('|');
    if (!escaped) return undefined;
    return `.*"todos":\\[.*(?:${escaped}).*\\].*`;
  },
  [GET_INTERNAL_DOCS_TOOL_NAME]: (tool) => {
    if (!hasParams(tool)) return undefined;
    const filePath = tool.params['file_path'];
    if (typeof filePath !== 'string') return undefined;
    const escaped = escapeJsonRegex(filePath);
    return `.*"file_path":"${escaped}".*`;
  },
};

/**
 * Handles policy updates for standard tools (Shell, Info, etc.), including
 * session-level and persistent approvals.
 */
async function handleStandardPolicyUpdate(
  tool: AnyDeclarativeTool,
  outcome: ToolConfirmationOutcome,
  confirmationDetails: SerializableConfirmationDetails | undefined,
  config: Config,
  messageBus: MessageBus,
): Promise<void> {
  if (
    outcome === ToolConfirmationOutcome.ProceedAlways ||
    outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave
  ) {
    const options: PolicyUpdateOptions = {};

    if (confirmationDetails?.type === 'exec') {
      options.commandPrefix = confirmationDetails.rootCommands;
    }

    if (confirmationDetails?.type === 'edit') {
      // Generate a specific argsPattern for file edits to prevent broad approvals
      const escapedPath = escapeJsonRegex(confirmationDetails.filePath);
      options.argsPattern = `.*"file_path":"${escapedPath}".*`;
    } else {
      const generator = specificityGenerators[tool.name];
      if (generator) {
        options.argsPattern = generator(tool, confirmationDetails);
      }
    }

    const persist =
      outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave ||
      (outcome === ToolConfirmationOutcome.ProceedAlways &&
        config.getAutoAddPolicy());

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: tool.name,
      persist,
      isSensitive: tool.isSensitive,
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
  config: Config,
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
  const persist =
    outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave ||
    (outcome === ToolConfirmationOutcome.ProceedAlways &&
      config.getAutoAddPolicy());

  // If "Always allow all tools from this server", use the wildcard pattern
  if (outcome === ToolConfirmationOutcome.ProceedAlwaysServer) {
    toolName = `${confirmationDetails.serverName}${MCP_QUALIFIED_NAME_SEPARATOR}*`;
  }

  // MCP tools are treated as sensitive, so we MUST provide a specific argsPattern
  // or commandPrefix to satisfy the auto-add safeguard in createPolicyUpdater.
  // For single-tool approvals, we default to a pattern that matches the JSON structure
  // of the arguments string (e.g. \{.*\}).
  const argsPattern =
    outcome !== ToolConfirmationOutcome.ProceedAlwaysServer
      ? '\\{.*\\}'
      : undefined;

  await messageBus.publish({
    type: MessageBusType.UPDATE_POLICY,
    toolName,
    mcpName: confirmationDetails.serverName,
    persist,
    isSensitive: tool.isSensitive,
    argsPattern,
  });
}
