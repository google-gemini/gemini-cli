/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Manages A2UI surfaces for the Gemini CLI A2A server.
 * Creates and updates surfaces for:
 * - Tool call approval UIs
 * - Agent text/thought streaming displays
 * - Task status indicators
 */

import type { Part } from '@a2a-js/sdk';
import { logger } from '../utils/logger.js';
import {
  A2UI_VERSION,
  STANDARD_CATALOG_ID,
  createA2UIPart,
  type A2UIServerMessage,
  type A2UIComponent,
} from './a2ui-extension.js';
import {
  column,
  row,
  text,
  button,
  card,
  icon,
  divider,
} from './a2ui-components.js';

/**
 * Generates A2UI parts for tool call approval surfaces.
 */
export function createToolCallApprovalSurface(
  taskId: string,
  toolCall: {
    callId: string;
    name: string;
    displayName?: string;
    description?: string;
    args?: Record<string, unknown>;
    kind?: string;
  },
): Part {
  const surfaceId = `tool_approval_${taskId}_${toolCall.callId}`;
  const toolDisplayName = toolCall.displayName || toolCall.name;
  const argsPreview = toolCall.args
    ? JSON.stringify(toolCall.args, null, 2).substring(0, 500)
    : 'No arguments';

  logger.info(
    `[A2UI] Creating tool approval surface: ${surfaceId} for tool: ${toolDisplayName}`,
  );

  const messages: A2UIServerMessage[] = [
    // 1. Create the surface
    {
      version: A2UI_VERSION,
      createSurface: {
        surfaceId,
        catalogId: STANDARD_CATALOG_ID,
        theme: {
          primaryColor: '#1a73e8',
          agentDisplayName: 'Gemini CLI Agent',
        },
        sendDataModel: true,
      },
    },
    // 2. Define the components
    {
      version: A2UI_VERSION,
      updateComponents: {
        surfaceId,
        components: buildToolApprovalComponents(
          taskId,
          toolCall.callId,
          toolDisplayName,
          toolCall.description || '',
          argsPreview,
          toolCall.kind || 'tool',
        ),
      },
    },
    // 3. Populate the data model
    {
      version: A2UI_VERSION,
      updateDataModel: {
        surfaceId,
        value: {
          tool: {
            callId: toolCall.callId,
            name: toolCall.name,
            displayName: toolDisplayName,
            description: toolCall.description || '',
            args: argsPreview,
            kind: toolCall.kind || 'tool',
            status: 'awaiting_approval',
          },
          taskId,
        },
      },
    },
  ];

  return createA2UIPart(messages);
}

function buildToolApprovalComponents(
  taskId: string,
  callId: string,
  toolName: string,
  description: string,
  argsPreview: string,
  kind: string,
): A2UIComponent[] {
  return [
    // Root card
    card('root', 'main_column'),

    // Main vertical layout
    column(
      'main_column',
      [
        'header_row',
        'description_text',
        'divider_1',
        'args_label',
        'args_text',
        'divider_2',
        'action_row',
      ],
      { align: 'stretch' },
    ),

    // Header with icon and tool name
    row('header_row', ['tool_icon', 'tool_name_text'], {
      align: 'center',
    }),
    icon('tool_icon', kind === 'shell' ? 'terminal' : 'build'),
    text('tool_name_text', `**${toolName}** requires approval`, {
      variant: 'h3',
    }),

    // Description
    text(
      'description_text',
      description || 'This tool needs your permission to execute.',
    ),

    divider('divider_1'),

    // Arguments preview
    text('args_label', '**Arguments:**', { variant: 'caption' }),
    text('args_text', `\`\`\`\n${argsPreview}\n\`\`\``),

    divider('divider_2'),

    // Action buttons row
    row(
      'action_row',
      ['approve_button', 'approve_always_button', 'reject_button'],
      { justify: 'spaceBetween' },
    ),

    // Approve button
    text('approve_label', 'Approve'),
    button(
      'approve_button',
      'approve_label',
      {
        event: {
          name: 'tool_confirmation',
          context: {
            taskId,
            callId,
            outcome: 'proceed_once',
          },
        },
      },
      { variant: 'primary' },
    ),

    // Approve always button
    text('approve_always_label', 'Always Allow'),
    button('approve_always_button', 'approve_always_label', {
      event: {
        name: 'tool_confirmation',
        context: {
          taskId,
          callId,
          outcome: 'proceed_always_tool',
        },
      },
    }),

    // Reject button
    text('reject_label', 'Reject'),
    button('reject_button', 'reject_label', {
      event: {
        name: 'tool_confirmation',
        context: {
          taskId,
          callId,
          outcome: 'cancel',
        },
      },
    }),
  ];
}

/**
 * Creates an A2UI surface update for tool execution status.
 */
export function updateToolCallStatus(
  taskId: string,
  callId: string,
  status: string,
  output?: string,
): Part {
  const surfaceId = `tool_approval_${taskId}_${callId}`;

  logger.info(
    `[A2UI] Updating tool status surface: ${surfaceId} status: ${status}`,
  );

  const messages: A2UIServerMessage[] = [
    {
      version: A2UI_VERSION,
      updateDataModel: {
        surfaceId,
        path: '/tool/status',
        value: status,
      },
    },
  ];

  // If tool completed, update the UI to show result
  if (['success', 'error', 'cancelled'].includes(status)) {
    messages.push({
      version: A2UI_VERSION,
      updateComponents: {
        surfaceId,
        components: [
          // Replace action row with status indicator
          row('action_row', ['status_icon', 'status_text'], {
            align: 'center',
          }),
          icon(
            'status_icon',
            status === 'success'
              ? 'check_circle'
              : status === 'error'
                ? 'error'
                : 'cancel',
          ),
          text(
            'status_text',
            status === 'success'
              ? 'Tool executed successfully'
              : status === 'error'
                ? 'Tool execution failed'
                : 'Tool execution cancelled',
          ),
        ],
      },
    });

    if (output) {
      messages.push({
        version: A2UI_VERSION,
        updateDataModel: {
          surfaceId,
          path: '/tool/output',
          value: output,
        },
      });
    }
  }

  return createA2UIPart(messages);
}

/**
 * Creates an A2UI text content surface for agent messages.
 */
export function createTextContentPart(
  taskId: string,
  content: string,
  surfaceId?: string,
): Part {
  const sid = surfaceId || `agent_text_${taskId}`;

  const messages: A2UIServerMessage[] = [
    {
      version: A2UI_VERSION,
      updateDataModel: {
        surfaceId: sid,
        path: '/content/text',
        value: content,
      },
    },
  ];

  return createA2UIPart(messages);
}

/**
 * Creates the initial agent response surface.
 */
export function createAgentResponseSurface(taskId: string): Part {
  const surfaceId = `agent_response_${taskId}`;

  logger.info(`[A2UI] Creating agent response surface: ${surfaceId}`);

  const messages: A2UIServerMessage[] = [
    {
      version: A2UI_VERSION,
      createSurface: {
        surfaceId,
        catalogId: STANDARD_CATALOG_ID,
        theme: {
          primaryColor: '#1a73e8',
          agentDisplayName: 'Gemini CLI Agent',
        },
      },
    },
    {
      version: A2UI_VERSION,
      updateComponents: {
        surfaceId,
        components: [
          card('root', 'response_column'),
          column('response_column', ['response_text', 'status_text'], {
            align: 'stretch',
          }),
          text('response_text', { path: '/response/text' }),
          text(
            'status_text',
            { path: '/response/status' },
            {
              variant: 'caption',
            },
          ),
        ],
      },
    },
    {
      version: A2UI_VERSION,
      updateDataModel: {
        surfaceId,
        value: {
          response: {
            text: '',
            status: 'Working...',
          },
        },
      },
    },
  ];

  return createA2UIPart(messages);
}

/**
 * Updates the agent response surface with new text content.
 */
export function updateAgentResponseText(
  taskId: string,
  content: string,
  status?: string,
): Part {
  const surfaceId = `agent_response_${taskId}`;

  const messages: A2UIServerMessage[] = [
    {
      version: A2UI_VERSION,
      updateDataModel: {
        surfaceId,
        path: '/response/text',
        value: content,
      },
    },
  ];

  if (status) {
    messages.push({
      version: A2UI_VERSION,
      updateDataModel: {
        surfaceId,
        path: '/response/status',
        value: status,
      },
    });
  }

  return createA2UIPart(messages);
}

/**
 * Creates an A2UI thought surface.
 */
export function createThoughtPart(
  taskId: string,
  subject: string,
  description: string,
): Part {
  const surfaceId = `thought_${taskId}_${Date.now()}`;

  const messages: A2UIServerMessage[] = [
    {
      version: A2UI_VERSION,
      createSurface: {
        surfaceId,
        catalogId: STANDARD_CATALOG_ID,
        theme: {
          primaryColor: '#7c4dff',
          agentDisplayName: 'Gemini CLI Agent',
        },
      },
    },
    {
      version: A2UI_VERSION,
      updateComponents: {
        surfaceId,
        components: [
          card('root', 'thought_column'),
          column('thought_column', ['thought_icon_row', 'thought_desc'], {
            align: 'stretch',
          }),
          row('thought_icon_row', ['thought_icon', 'thought_subject'], {
            align: 'center',
          }),
          icon('thought_icon', 'psychology'),
          text('thought_subject', `*${subject}*`, { variant: 'h4' }),
          text('thought_desc', description),
        ],
      },
    },
  ];

  return createA2UIPart(messages);
}

/**
 * Deletes a tool approval surface after resolution.
 */
export function deleteToolApprovalSurface(
  taskId: string,
  callId: string,
): Part {
  const surfaceId = `tool_approval_${taskId}_${callId}`;

  logger.info(`[A2UI] Deleting tool approval surface: ${surfaceId}`);

  const messages: A2UIServerMessage[] = [
    {
      version: A2UI_VERSION,
      deleteSurface: {
        surfaceId,
      },
    },
  ];

  return createA2UIPart(messages);
}
