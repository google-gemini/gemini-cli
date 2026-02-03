/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type ToolCall,
  type Status as CoreStatus,
  type ToolCallConfirmationDetails,
  type SerializableConfirmationDetails,
  type ToolResultDisplay,
  debugLogger,
} from '@google/gemini-cli-core';
import {
  ToolCallStatus,
  type HistoryItemToolGroup,
  type IndividualToolCallDisplay,
} from '../types.js';

import { checkExhaustive } from '@google/gemini-cli-core';

export function mapCoreStatusToDisplayStatus(
  coreStatus: CoreStatus,
): ToolCallStatus {
  switch (coreStatus) {
    case 'validating':
      return ToolCallStatus.Pending;
    case 'awaiting_approval':
      return ToolCallStatus.Confirming;
    case 'executing':
      return ToolCallStatus.Executing;
    case 'success':
      return ToolCallStatus.Success;
    case 'cancelled':
      return ToolCallStatus.Canceled;
    case 'error':
      return ToolCallStatus.Error;
    case 'scheduled':
      return ToolCallStatus.Pending;
    default:
      return checkExhaustive(coreStatus);
  }
}

/**
 * Transforms `ToolCall` objects into `HistoryItemToolGroup` objects for UI
 * display. This is a pure projection layer and does not track interaction
 * state.
 */
export function mapToDisplay(
  toolOrTools: ToolCall[] | ToolCall,
  options: { borderTop?: boolean; borderBottom?: boolean } = {},
): HistoryItemToolGroup {
  const toolCalls = Array.isArray(toolOrTools) ? toolOrTools : [toolOrTools];
  const { borderTop, borderBottom } = options;

  const toolDisplays = toolCalls.map((call): IndividualToolCallDisplay => {
    let description: string;
    let renderOutputAsMarkdown = false;

    const displayName = call.tool?.displayName ?? call.request.name;

    if (call.status === 'error') {
      description = JSON.stringify(call.request.args);
    } else {
      description = call.invocation.getDescription();
      renderOutputAsMarkdown = call.tool.isOutputMarkdown;
    }

    const baseDisplayProperties = {
      callId: call.request.callId,
      name: displayName,
      description,
      renderOutputAsMarkdown,
    };

    let resultDisplay: ToolResultDisplay | undefined = undefined;
    let confirmationDetails:
      | ToolCallConfirmationDetails
      | SerializableConfirmationDetails
      | undefined = undefined;
    let outputFile: string | undefined = undefined;
    let ptyId: number | undefined = undefined;
    let correlationId: string | undefined = undefined;

    switch (call.status) {
      case 'success':
        resultDisplay = call.response.resultDisplay;
        outputFile = call.response.outputFile;
        break;
      case 'error':
      case 'cancelled':
        resultDisplay = call.response.resultDisplay;
        break;
      case 'awaiting_approval':
        correlationId = call.correlationId;
        // Pass through details. Context handles dispatch (callback vs bus).
        confirmationDetails = call.confirmationDetails;
        break;
      case 'executing':
        resultDisplay = call.liveOutput;
        ptyId = call.pid;
        break;
      case 'scheduled':
      case 'validating':
        break;
      default: {
        const exhaustiveCheck: never = call;
        debugLogger.warn(
          `Unhandled tool call status in mapper: ${
            (exhaustiveCheck as ToolCall).status
          }`,
        );
        break;
      }
    }

    return {
      ...baseDisplayProperties,
      status: mapCoreStatusToDisplayStatus(call.status),
      resultDisplay,
      confirmationDetails,
      outputFile,
      ptyId,
      correlationId,
    };
  });

  return {
    type: 'tool_group',
    tools: toolDisplays,
    borderTop,
    borderBottom,
  };
}
