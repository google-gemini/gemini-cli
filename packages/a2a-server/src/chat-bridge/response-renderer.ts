/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converts A2A/A2UI responses into Google Chat messages and Cards V2.
 *
 * This renderer understands the A2UI v0.10 surface structures produced by our
 * a2a-server (tool approval surfaces, agent response surfaces, thought surfaces)
 * and converts them to Google Chat's Cards V2 format.
 *
 * Inspired by the A2UI web_core message processor pattern but simplified for
 * server-side rendering to a constrained card format.
 */

import type { ChatResponse, ChatCardV2, ChatWidget } from './types.js';
import type { Part } from '@a2a-js/sdk';
import {
  type A2AResponse,
  type A2AStreamEventData,
  extractAllParts,
  extractTextFromParts,
  extractA2UIParts,
} from './a2a-bridge-client.js';

export interface ToolApprovalInfo {
  taskId: string;
  callId: string;
  name: string;
  displayName: string;
  description: string;
  args: string;
  kind: string;
  status: string;
}

interface AgentResponseInfo {
  text: string;
  status: string;
}

/**
 * Extracts tool approval info from an A2A response.
 * Used by the handler to track pending approvals for text-based confirmation.
 */
export function extractToolApprovals(
  response: A2AResponse,
): ToolApprovalInfo[] {
  const parts = extractAllParts(response);
  const a2uiMessageGroups = extractA2UIParts(parts);
  const toolApprovals: ToolApprovalInfo[] = [];
  const agentResponses: AgentResponseInfo[] = [];
  const thoughts: Array<{ subject: string; description: string }> = [];

  for (const messages of a2uiMessageGroups) {
    parseA2UIMessages(messages, toolApprovals, agentResponses, thoughts);
  }

  return deduplicateToolApprovals(toolApprovals);
}

/**
 * Renders an A2A response as a Google Chat response.
 * Extracts text content and A2UI surfaces, converting them to Chat format.
 */
export function renderResponse(
  response: A2AResponse,
  threadKey?: string,
  threadName?: string,
): ChatResponse {
  const parts = extractAllParts(response);
  const textContent = extractTextFromParts(parts);
  const a2uiMessageGroups = extractA2UIParts(parts);

  // Parse A2UI surfaces for known types
  const toolApprovals: ToolApprovalInfo[] = [];
  const agentResponses: AgentResponseInfo[] = [];
  const thoughts: Array<{ subject: string; description: string }> = [];

  for (const messages of a2uiMessageGroups) {
    parseA2UIMessages(messages, toolApprovals, agentResponses, thoughts);
  }

  // Deduplicate tool approvals by surfaceId — A2UI history contains both
  // initial 'awaiting_approval' and later 'success' events for auto-approved tools.
  const dedupedApprovals = deduplicateToolApprovals(toolApprovals);

  const cards: ChatCardV2[] = [];

  // Only render tool approval cards for tools still awaiting approval.
  // In YOLO mode, tools are auto-approved and their status becomes "success"
  // so we skip rendering approval cards for those.
  for (const approval of dedupedApprovals) {
    if (approval.status === 'awaiting_approval') {
      cards.push(renderToolApprovalCard(approval));
    }
  }

  // Build text response from agent responses and plain text
  const responseTexts: string[] = [];

  // Add thought summaries
  for (const thought of thoughts) {
    responseTexts.push(`_${thought.subject}_: ${thought.description}`);
  }

  // Add agent response text (from A2UI surfaces).
  // Use only the last non-empty response since later updates supersede earlier
  // ones for the same surface (history contains multiple status-update messages).
  for (let i = agentResponses.length - 1; i >= 0; i--) {
    if (agentResponses[i].text) {
      responseTexts.push(agentResponses[i].text);
      break;
    }
  }

  // Fall back to plain text content if no A2UI response text
  if (responseTexts.length === 0 && textContent) {
    responseTexts.push(textContent);
  }

  // Add task state info
  if (response.kind === 'task' && response.status) {
    const state = response.status.state;
    if (state === 'input-required' && cards.length > 0) {
      responseTexts.push('*Waiting for your approval to continue...*');
    } else if (state === 'failed') {
      responseTexts.push('*Task failed.*');
    } else if (state === 'canceled') {
      responseTexts.push('*Task was cancelled.*');
    }
  }

  const chatResponse: ChatResponse = {};

  if (responseTexts.length > 0) {
    chatResponse.text = responseTexts.join('\n\n');
  }

  if (cards.length > 0) {
    chatResponse.cardsV2 = cards;
  }

  if (threadKey || threadName) {
    chatResponse.thread = {};
    if (threadKey) chatResponse.thread.threadKey = threadKey;
    if (threadName) chatResponse.thread.name = threadName;
  }

  // Ensure we always return something
  if (!chatResponse.text && !chatResponse.cardsV2) {
    chatResponse.text = '_Agent is processing..._';
  }

  return chatResponse;
}

/**
 * Renders a CARD_CLICKED acknowledgment response.
 */
export function renderActionAcknowledgment(
  action: string,
  outcome: string,
): ChatResponse {
  const emoji =
    outcome === 'cancel'
      ? 'Rejected'
      : outcome === 'proceed_always_tool'
        ? 'Always Allowed'
        : 'Approved';
  return {
    actionResponse: { type: 'UPDATE_MESSAGE' },
    text: `*Tool ${emoji}* - Processing...`,
  };
}

/** Safely extracts a string property from an unknown object. */
function str(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
}

/** Safely checks if an unknown value is a record. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Safely extracts a nested object property. */
function obj(
  parent: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const v = parent[key];
  return isRecord(v) ? v : undefined;
}

/**
 * Deduplicates tool approvals by surfaceId, keeping the last entry per surface.
 * In blocking mode, A2UI history accumulates ALL intermediate events — a tool
 * surface may appear first as 'awaiting_approval' then as 'success' (YOLO mode).
 * By keeping only the last entry per surfaceId, auto-approved tools show 'success'.
 */
function deduplicateToolApprovals(
  approvals: ToolApprovalInfo[],
): ToolApprovalInfo[] {
  const byId = new Map<string, ToolApprovalInfo>();
  for (const a of approvals) {
    const key = `${a.taskId}_${a.callId}`;
    byId.set(key, a);
  }
  return [...byId.values()];
}

/**
 * Parses A2UI v0.10 messages to extract known surface types.
 * Our server produces specific surfaces: tool approval, agent response, thought.
 */
function parseA2UIMessages(
  messages: unknown[],
  toolApprovals: ToolApprovalInfo[],
  agentResponses: AgentResponseInfo[],
  thoughts: Array<{ subject: string; description: string }>,
): void {
  for (const msg of messages) {
    if (!isRecord(msg)) continue;

    // Look for updateDataModel messages that contain tool approval or response data
    const updateDM = obj(msg, 'updateDataModel');
    if (updateDM) {
      const surfaceId = str(updateDM, 'surfaceId');
      const value = obj(updateDM, 'value');
      const path = str(updateDM, 'path');

      if (value && !path) {
        // Full data model update (initial) - check for known structures
        const tool = obj(value, 'tool');
        if (surfaceId.startsWith('tool_approval_') && tool) {
          toolApprovals.push({
            taskId: str(value, 'taskId'),
            callId: str(tool, 'callId'),
            name: str(tool, 'name'),
            displayName: str(tool, 'displayName'),
            description: str(tool, 'description'),
            args: str(tool, 'args'),
            kind: str(tool, 'kind') || 'tool',
            status: str(tool, 'status') || 'unknown',
          });
        }

        const resp = obj(value, 'response');
        if (surfaceId.startsWith('agent_response_') && resp) {
          agentResponses.push({
            text: str(resp, 'text'),
            status: str(resp, 'status'),
          });
        }
      }

      // Partial data model updates (path-based)
      if (path === '/response/text' && updateDM['value'] != null) {
        agentResponses.push({
          text: String(updateDM['value']),
          status: '',
        });
      }

      // Tool status updates (e.g., YOLO mode changes status to 'success')
      if (
        surfaceId.startsWith('tool_approval_') &&
        path === '/tool/status' &&
        typeof updateDM['value'] === 'string'
      ) {
        // Find existing tool approval for this surface and update its status
        const existing = toolApprovals.find(
          (a) => `tool_approval_${a.taskId}_${a.callId}` === surfaceId,
        );
        if (existing) {
          existing.status = updateDM['value'];
        }
      }
    }

    // Look for updateComponents to extract thought text
    const updateComp = obj(msg, 'updateComponents');
    if (updateComp) {
      const surfaceId = str(updateComp, 'surfaceId');
      const components = updateComp['components'];

      if (surfaceId.startsWith('thought_') && Array.isArray(components)) {
        const subject = extractComponentText(components, 'thought_subject');
        const desc = extractComponentText(components, 'thought_desc');
        if (subject || desc) {
          thoughts.push({
            subject: subject || 'Thinking',
            description: desc || '',
          });
        }
      }
    }
  }
}

/**
 * Extracts the text content from a named component in a component array.
 * Components use our a2ui-components.ts builder format.
 */
function extractComponentText(
  components: unknown[],
  componentId: string,
): string {
  for (const comp of components) {
    if (!isRecord(comp)) continue;
    if (comp['id'] === componentId && comp['component'] === 'text') {
      return str(comp, 'text');
    }
  }
  return '';
}

/**
 * Extracts a concise command summary from tool approval args.
 * For shell tools, returns just the command string.
 * For file tools, returns the file path.
 */
function extractCommandSummary(approval: ToolApprovalInfo): string {
  if (!approval.args || approval.args === 'No arguments') return '';

  try {
    const parsed: unknown = JSON.parse(approval.args);
    if (isRecord(parsed)) {
      // Shell tool: {"command": "ls -F"}
      if (typeof parsed['command'] === 'string') {
        return parsed['command'];
      }
      // File tools: {"file_path": "/path/to/file", ...}
      if (typeof parsed['file_path'] === 'string') {
        const action =
          approval.name || approval.displayName || 'File operation';
        return `${action}: ${parsed['file_path']}`;
      }
    }
  } catch {
    // Not JSON, return as-is if short enough
    if (approval.args.length <= 200) return approval.args;
  }

  return '';
}

/**
 * Renders a tool approval surface as a compact Google Chat Card V2
 * with clickable Approve/Reject buttons.
 */
function renderToolApprovalCard(approval: ToolApprovalInfo): ChatCardV2 {
  const widgets: ChatWidget[] = [];
  const toolLabel = approval.displayName || approval.name;

  // Show a concise summary of what the tool will do.
  const commandSummary = extractCommandSummary(approval);
  if (commandSummary) {
    widgets.push({
      decoratedText: {
        text: `\`${commandSummary}\``,
        topLabel: toolLabel,
        startIcon: { knownIcon: 'DESCRIPTION' },
        wrapText: true,
      },
    });
  } else if (approval.args && approval.args !== 'No arguments') {
    const truncatedArgs =
      approval.args.length > 200
        ? approval.args.substring(0, 200) + '...'
        : approval.args;
    widgets.push({
      decoratedText: {
        text: truncatedArgs,
        topLabel: toolLabel,
        startIcon: { knownIcon: 'DESCRIPTION' },
        wrapText: true,
      },
    });
  }

  // Clickable buttons for approve/reject
  widgets.push({
    buttonList: {
      buttons: [
        {
          text: 'Approve',
          onClick: {
            action: {
              function: 'tool_confirmation',
              parameters: [
                { key: 'callId', value: approval.callId },
                { key: 'outcome', value: 'proceed_once' },
                { key: 'taskId', value: approval.taskId },
              ],
            },
          },
        },
        {
          text: 'Always Allow',
          onClick: {
            action: {
              function: 'tool_confirmation',
              parameters: [
                { key: 'callId', value: approval.callId },
                { key: 'outcome', value: 'proceed_always_tool' },
                { key: 'taskId', value: approval.taskId },
              ],
            },
          },
        },
        {
          text: 'Reject',
          onClick: {
            action: {
              function: 'tool_confirmation',
              parameters: [
                { key: 'callId', value: approval.callId },
                { key: 'outcome', value: 'cancel' },
                { key: 'taskId', value: approval.taskId },
              ],
            },
          },
          color: { red: 0.8, green: 0.2, blue: 0.2 },
        },
      ],
    },
  });

  return {
    cardId: `tool_approval_${approval.callId}`,
    card: {
      header: {
        title: toolLabel,
        subtitle: 'Approval Required',
      },
      sections: [{ widgets }],
    },
  };
}

/**
 * Extracts text and tool approval info from a single streaming event.
 * Works with TaskStatusUpdateEvent, Task, and Message events.
 */
export function extractFromStreamEvent(event: A2AStreamEventData): {
  text: string;
  toolApprovals: ToolApprovalInfo[];
  state?: string;
  taskId?: string;
  contextId?: string;
} {
  const toolApprovals: ToolApprovalInfo[] = [];
  const agentResponses: AgentResponseInfo[] = [];
  const thoughts: Array<{ subject: string; description: string }> = [];
  let state: string | undefined;
  let taskId: string | undefined;
  let contextId: string | undefined;

  if (event.kind === 'status-update') {
    state = event.status?.state;
    taskId = event.taskId;
    contextId = event.contextId;

    // Extract parts from the status message
    const parts: Part[] = event.status?.message?.parts ?? [];
    const a2uiGroups = extractA2UIParts(parts);
    for (const messages of a2uiGroups) {
      parseA2UIMessages(messages, toolApprovals, agentResponses, thoughts);
    }

    // Also extract plain text
    const plainText = extractTextFromParts(parts);
    if (plainText) {
      agentResponses.push({ text: plainText, status: '' });
    }
  } else if (event.kind === 'task') {
    state = event.status?.state;
    taskId = event.id;
    contextId = event.contextId;

    const parts = extractAllParts(event);
    const a2uiGroups = extractA2UIParts(parts);
    for (const messages of a2uiGroups) {
      parseA2UIMessages(messages, toolApprovals, agentResponses, thoughts);
    }

    const plainText = extractTextFromParts(parts);
    if (plainText) {
      agentResponses.push({ text: plainText, status: '' });
    }
  } else if (event.kind === 'message') {
    contextId = event.contextId;
    taskId = event.taskId;

    const parts: Part[] = event.parts ?? [];
    const a2uiGroups = extractA2UIParts(parts);
    for (const messages of a2uiGroups) {
      parseA2UIMessages(messages, toolApprovals, agentResponses, thoughts);
    }

    const plainText = extractTextFromParts(parts);
    if (plainText) {
      agentResponses.push({ text: plainText, status: '' });
    }
  }

  // Build text from the last non-empty agent response
  let text = '';
  for (let i = agentResponses.length - 1; i >= 0; i--) {
    if (agentResponses[i].text) {
      text = agentResponses[i].text;
      break;
    }
  }

  // Add thought summaries
  if (thoughts.length > 0) {
    const thoughtText = thoughts
      .map((t) => `_${t.subject}_: ${t.description}`)
      .join('\n');
    text = text ? `${thoughtText}\n\n${text}` : thoughtText;
  }

  return {
    text,
    toolApprovals: deduplicateToolApprovals(toolApprovals),
    state,
    taskId,
    contextId,
  };
}
