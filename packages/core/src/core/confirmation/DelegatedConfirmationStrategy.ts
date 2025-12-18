/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConfirmationStrategy } from './types.js';
import {
  MessageBusType,
  type ToolConfirmationRequest,
  type ToolConfirmationResponse,
  type SerializableToolConfirmationDetails,
} from '../../confirmation-bus/types.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { ToolCallRequestInfo } from '../turn.js';
import {
  ToolConfirmationOutcome,
  type ToolCallConfirmationDetails,
} from '../../tools/tools.js';
import { randomUUID } from 'node:crypto';

export class DelegatedConfirmationStrategy implements ConfirmationStrategy {
  constructor(private readonly messageBus: MessageBus) {}

  async confirm(
    toolCall: ToolCallRequestInfo,
    confirmationDetails: ToolCallConfirmationDetails,
    signal: AbortSignal,
  ): Promise<ToolConfirmationOutcome> {
    const correlationId = randomUUID();

    return new Promise<ToolConfirmationOutcome>((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | undefined;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        signal.removeEventListener('abort', abortHandler);
        this.messageBus.unsubscribe(
          MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          responseHandler,
        );
      };

      const abortHandler = () => {
        cleanup();
        resolve(ToolConfirmationOutcome.Cancel);
      };

      const responseHandler = (response: ToolConfirmationResponse) => {
        if (response.correlationId === correlationId) {
          if (response.requiresUserConfirmation) {
            return;
          }

          cleanup();
          if (response.confirmed) {
            resolve(ToolConfirmationOutcome.ProceedOnce);
          } else {
            resolve(ToolConfirmationOutcome.Cancel);
          }
        }
      };

      if (signal.aborted) {
        abortHandler();
        return;
      }

      signal.addEventListener('abort', abortHandler);

      this.messageBus.subscribe(
        MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        responseHandler,
      );

      // Serialize confirmation details
      const serializableDetails =
        this.serializeConfirmationDetails(confirmationDetails);

      const request: ToolConfirmationRequest = {
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: {
          name: toolCall.name,
          args: toolCall.args,
          id: toolCall.callId,
        },
        correlationId,
        confirmationDetails: serializableDetails,
      };

      this.messageBus.publish(request).catch((err) => {
        cleanup();
        reject(err);
      });
    });
  }

  private serializeConfirmationDetails(
    details: ToolCallConfirmationDetails,
  ): SerializableToolConfirmationDetails | undefined {
    switch (details.type) {
      case 'edit':
        return {
          type: 'edit',
          title: details.title,
          fileName: details.fileName,
          filePath: details.filePath,
          fileDiff: details.fileDiff,
          originalContent: details.originalContent,
          newContent: details.newContent,
          isModifying: details.isModifying,
        };
      case 'exec':
        return {
          type: 'exec',
          title: details.title,
          command: details.command,
          rootCommand: details.rootCommand,
        };
      case 'mcp':
        return {
          type: 'mcp',
          title: details.title,
          serverName: details.serverName,
          toolName: details.toolName,
          toolDisplayName: details.toolDisplayName,
        };
      case 'info':
        return {
          type: 'info',
          title: details.title,
          prompt: details.prompt,
          urls: details.urls,
        };
      default:
        return undefined;
    }
  }
}
