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

import type {
  ChatResponse,
  ChatCardV2,
  ChatCardSection,
  ChatWidget,
  ChatButton,
} from './types.js';
import {
  type A2AResponse,
  extractAllParts,
  extractTextFromParts,
  extractA2UIParts,
} from './a2a-bridge-client.js';

interface ToolApprovalInfo {
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
 * Renders an A2A response as a Google Chat response.
 * Extracts text content and A2UI surfaces, converting them to Chat format.
 */
export function renderResponse(
  response: A2AResponse,
  threadKey?: string,
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

  const cards: ChatCardV2[] = [];

  // Render tool approval cards
  for (const approval of toolApprovals) {
    cards.push(renderToolApprovalCard(approval));
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
    if (state === 'input-required' && toolApprovals.length > 0) {
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

  if (threadKey) {
    chatResponse.thread = { threadKey };
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
 * Renders a tool approval surface as a Google Chat Card V2.
 */
function renderToolApprovalCard(approval: ToolApprovalInfo): ChatCardV2 {
  const widgets: ChatWidget[] = [];

  // Tool description
  if (approval.description) {
    widgets.push({
      decoratedText: {
        text: approval.description,
        topLabel: 'Description',
        wrapText: true,
      },
    });
  }

  // Arguments preview
  if (approval.args && approval.args !== 'No arguments') {
    // Truncate long args for the card
    const truncatedArgs =
      approval.args.length > 300
        ? approval.args.substring(0, 300) + '...'
        : approval.args;

    widgets.push({
      decoratedText: {
        text: truncatedArgs,
        topLabel: 'Arguments',
        startIcon: { knownIcon: 'DESCRIPTION' },
        wrapText: true,
      },
    });
  }

  widgets.push({ divider: {} });

  // Action buttons
  const buttons: ChatButton[] = [
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
      color: { red: 0.1, green: 0.45, blue: 0.91 },
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
      color: { red: 0.85, green: 0.2, blue: 0.2 },
    },
  ];

  widgets.push({ buttonList: { buttons } });

  const sections: ChatCardSection[] = [
    {
      widgets,
    },
  ];

  return {
    cardId: `tool_approval_${approval.callId}`,
    card: {
      header: {
        title: 'Tool Approval Required',
        subtitle: approval.displayName || approval.name,
      },
      sections,
    },
  };
}
