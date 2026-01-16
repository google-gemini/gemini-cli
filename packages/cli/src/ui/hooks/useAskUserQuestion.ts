/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import {
  type Config,
  MessageBusType,
  type AskUserQuestionRequest,
  type AskUserQuestionResponse,
  type Question,
} from '@google/gemini-cli-core';

export interface AskUserQuestionState {
  questions: Question[];
  correlationId: string;
}

export function useAskUserQuestion(config: Config) {
  const [request, setRequest] = useState<AskUserQuestionState | null>(null);

  useEffect(() => {
    const messageBus = config.getMessageBus();
    if (!messageBus) return;

    const handler = (msg: AskUserQuestionRequest) => {
      setRequest({
        questions: msg.questions,
        correlationId: msg.correlationId,
      });
    };

    messageBus.subscribe(MessageBusType.ASK_USER_QUESTION_REQUEST, handler);

    return () => {
      messageBus.unsubscribe(MessageBusType.ASK_USER_QUESTION_REQUEST, handler);
    };
  }, [config]);

  const handleSubmit = useCallback(
    async (answers: { [questionIndex: string]: string }) => {
      if (!request) return;

      const messageBus = config.getMessageBus();
      if (!messageBus) return;

      const response: AskUserQuestionResponse = {
        type: MessageBusType.ASK_USER_QUESTION_RESPONSE,
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
