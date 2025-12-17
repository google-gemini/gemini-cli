/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  type Config,
  MessageBusType,
  type ToolConfirmationRequest,
  type ToolConfirmationResponse,
} from '@google/gemini-cli-core';

export function useToolConfirmationListener(config: Config | null) {
  const [request, setRequest] = useState<ToolConfirmationRequest | null>(null);

  useEffect(() => {
    if (!config) return;
    const messageBus = config.getMessageBus();
    if (!messageBus) return;

    const requestHandler = (req: ToolConfirmationRequest) => {
      setRequest(req);
    };

    const responseHandler = (res: ToolConfirmationResponse) => {
      setRequest((currentRequest) => {
        if (
          !currentRequest ||
          currentRequest.correlationId !== res.correlationId
        ) {
          return currentRequest;
        }

        // If the confirmation is handled by a legacy flow (e.g., inline UI)
        // or if it has already been confirmed/denied, we should clear the modal.
        if (res.requiresUserConfirmation || res.confirmed !== undefined) {
          return null;
        }

        return currentRequest;
      });
    };

    messageBus.subscribe(
      MessageBusType.TOOL_CONFIRMATION_REQUEST,
      requestHandler,
    );
    messageBus.subscribe(
      MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      responseHandler,
    );

    return () => {
      messageBus.unsubscribe(
        MessageBusType.TOOL_CONFIRMATION_REQUEST,
        requestHandler,
      );
      messageBus.unsubscribe(
        MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        responseHandler,
      );
    };
  }, [config]);

  const onConfirm = (confirmed: boolean) => {
    if (!request) return;
    if (!config) return;
    const messageBus = config.getMessageBus();
    if (messageBus) {
      const response: ToolConfirmationResponse = {
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: request.correlationId,
        confirmed,
      };
      void messageBus.publish(response);
    }
    setRequest(null);
  };

  return { request, onConfirm };
}
