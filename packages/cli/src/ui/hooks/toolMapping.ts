/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type ToolCall,
  type SerializableConfirmationDetails,
  type ToolResultDisplay,
  debugLogger,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';
import {
  type HistoryItemToolGroup,
  type IndividualToolCallDisplay,
} from '../types.js';

/**
 * Transforms `ToolCall` objects into `HistoryItemToolGroup` objects for UI
 * display. This is a pure projection layer and does not track interaction
 * state.
 */
export function mapToDisplay(
  toolOrTools: ToolCall[] | ToolCall,
  options: {
    borderTop?: boolean;
    borderBottom?: boolean;
    borderColor?: string;
    borderDimColor?: boolean;
  } = {},
): HistoryItemToolGroup {
  const toolCalls = Array.isArray(toolOrTools) ? toolOrTools : [toolOrTools];
  const { borderTop, borderBottom, borderColor, borderDimColor } = options;

  const toolDisplays = toolCalls.map((call): IndividualToolCallDisplay => {
    let description: string;
    let renderOutputAsMarkdown = false;

    const displayName = call.tool?.displayName ?? call.request.name;

    if (call.status === CoreToolCallStatus.Error) {
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
    let confirmationDetails: SerializableConfirmationDetails | undefined =
      undefined;
    let outputFile: string | undefined = undefined;
    let ptyId: number | undefined = undefined;
    let correlationId: string | undefined = undefined;
    let progressMessage: string | undefined = undefined;
    let progressPercent: number | undefined = undefined;

    switch (call.status) {
      case CoreToolCallStatus.Success:
        resultDisplay = call.response.resultDisplay;
        outputFile = call.response.outputFile;
        break;
      case CoreToolCallStatus.Error:
      case CoreToolCallStatus.Cancelled:
        resultDisplay = call.response.resultDisplay;
        break;
      case CoreToolCallStatus.AwaitingApproval:
        correlationId = call.correlationId;
        // Pass through details. Context handles dispatch (callback vs bus).
        confirmationDetails = call.confirmationDetails;
        break;
      case CoreToolCallStatus.Executing:
        resultDisplay = call.liveOutput;
        ptyId = call.pid;
        progressMessage = call.progressMessage;
        progressPercent = call.progressPercent;
        break;
      case CoreToolCallStatus.Scheduled:
      case CoreToolCallStatus.Validating:
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
      status: call.status,
      resultDisplay,
      confirmationDetails,
      outputFile,
      ptyId,
      correlationId,
      progressMessage,
      progressPercent,
      approvalMode: call.approvalMode,
    };
  });

  return {
    type: 'tool_group',
    tools: toolDisplays,
    borderTop,
    borderBottom,
    borderColor,
    borderDimColor,
  };
}
