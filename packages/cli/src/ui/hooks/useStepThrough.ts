/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MessageBusType,
  type Config,
  type StepThroughRequest,
} from '@google/gemini-cli-core';

export function useStepThrough(config: Config) {
  const [activeRequest, setActiveRequest] = useState<StepThroughRequest | null>(
    null,
  );

  const messageBus = useMemo(() => config.getMessageBus(), [config]);

  useEffect(() => {
    const handler = (request: StepThroughRequest) => {
      setActiveRequest(request);
    };

    messageBus.subscribe(MessageBusType.STEP_THROUGH_REQUEST, handler);
    return () => {
      messageBus.unsubscribe(MessageBusType.STEP_THROUGH_REQUEST, handler);
    };
  }, [messageBus]);

  const onAction = useCallback(
    (action: 'run' | 'skip' | 'continue' | 'cancel') => {
      if (!activeRequest) return;

      void messageBus.publish({
        type: MessageBusType.STEP_THROUGH_RESPONSE,
        correlationId: activeRequest.correlationId,
        callId: activeRequest.callId,
        action,
      });

      setActiveRequest(null);
    },
    [activeRequest, messageBus],
  );

  return { activeRequest, onAction };
}
