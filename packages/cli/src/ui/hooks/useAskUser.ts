/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import {
  type Config,
  MessageBusType,
  type AskUserRequest,
  type AskUserResponse,
  type Question,
} from '@google/gemini-cli-core';

export interface AskUserState {
  questions: Question[];
  correlationId: string;
}

export function useAskUser(config: Config) {
  const [request, setRequest] = useState<AskUserState | null>(null);

  useEffect(() => {
    const messageBus = config.getMessageBus();
    if (!messageBus) return;

    const askUserRequestHandler = (msg: AskUserRequest) => {
      setRequest({
        questions: msg.questions,
        correlationId: msg.correlationId,
      });
    };

    messageBus.subscribe(
      MessageBusType.ASK_USER_REQUEST,
      askUserRequestHandler,
    );

    return () => {
      messageBus.unsubscribe(
        MessageBusType.ASK_USER_REQUEST,
        askUserRequestHandler,
      );
    };
  }, [config]);

  const handleSubmit = useCallback(
    async (answers: { [questionIndex: string]: string }) => {
      if (!request) return;

      const messageBus = config.getMessageBus();
      if (!messageBus) return;

      const response: AskUserResponse = {
        type: MessageBusType.ASK_USER_RESPONSE,
        correlationId: request.correlationId,
        answers,
      };

      await messageBus.publish(response);
      setRequest(null);
    },
    [config, request],
  );

  const clearRequest = useCallback(() => {
    setRequest(null);
  }, []);

  return {
    request,
    handleSubmit,
    clearRequest,
  };
}
