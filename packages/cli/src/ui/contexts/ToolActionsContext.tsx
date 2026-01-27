/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
} from 'react';
import {
  IdeClient,
  ToolConfirmationOutcome,
  MessageBusType,
  type Config,
  type ToolConfirmationPayload,
  type ToolCallConfirmationDetails,
  debugLogger,
} from '@google/gemini-cli-core';
import type { IndividualToolCallDisplay } from '../types.js';

interface ToolActionsContextValue {
  confirm: (
    callId: string,
    outcome: ToolConfirmationOutcome,
    payload?: ToolConfirmationPayload,
  ) => Promise<void>;
  cancel: (callId: string) => Promise<void>;
  isDiffingEnabled: boolean;
}

const ToolActionsContext = createContext<ToolActionsContextValue | null>(null);

export const useToolActions = () => {
  const context = useContext(ToolActionsContext);
  if (!context) {
    throw new Error('useToolActions must be used within a ToolActionsProvider');
  }
  return context;
};

interface ToolActionsProviderProps {
  children: React.ReactNode;
  config: Config;
  toolCalls: IndividualToolCallDisplay[];
}

export const ToolActionsProvider: React.FC<ToolActionsProviderProps> = (
  props: ToolActionsProviderProps,
) => {
  const { children, config, toolCalls } = props;

  // Hoist IdeClient logic here to keep UI pure
  const [ideClient, setIdeClient] = useState<IdeClient | null>(null);
  const [isDiffingEnabled, setIsDiffingEnabled] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (config.getIdeMode()) {
      IdeClient.getInstance()
        .then((client) => {
          if (!isMounted) return;
          setIdeClient(client);
          setIsDiffingEnabled(client.isDiffingEnabled());

          const handleStatusChange = () => {
            if (isMounted) {
              setIsDiffingEnabled(client.isDiffingEnabled());
            }
          };

          client.addStatusChangeListener(handleStatusChange);
          // Return a cleanup function for the listener
          return () => {
            client.removeStatusChangeListener(handleStatusChange);
          };
        })
        .catch((error) => {
          debugLogger.error('Failed to get IdeClient instance:', error);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [config]);

  const confirm = useCallback(
    async (
      callId: string,
      outcome: ToolConfirmationOutcome,
      payload?: ToolConfirmationPayload,
    ) => {
      const tool = toolCalls.find((t) => t.callId === callId);
      if (!tool) {
        debugLogger.warn(`ToolActions: Tool ${callId} not found`);
        return;
      }

      const details = tool.confirmationDetails;

      // 1. Handle Side Effects (IDE Diff)
      if (
        details?.type === 'edit' &&
        isDiffingEnabled &&
        'filePath' in details // Check for safety
      ) {
        const cliOutcome =
          outcome === ToolConfirmationOutcome.Cancel ? 'rejected' : 'accepted';
        await ideClient?.resolveDiffFromCli(details.filePath, cliOutcome);
      }

      // 2. Dispatch
      // PATH A: Event Bus (Modern)
      if (tool.correlationId) {
        await config.getMessageBus().publish({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: tool.correlationId,
          confirmed: outcome !== ToolConfirmationOutcome.Cancel,
          requiresUserConfirmation: false,
          outcome,
          payload,
        });
        return;
      }

      // PATH B: Legacy Callback (Adapter or Old Scheduler)
      if (
        details &&
        'onConfirm' in details &&
        typeof details.onConfirm === 'function'
      ) {
        await (details as ToolCallConfirmationDetails).onConfirm(
          outcome,
          payload,
        );
        return;
      }

      debugLogger.warn(`ToolActions: No confirmation mechanism for ${callId}`);
    },
    [config, ideClient, toolCalls, isDiffingEnabled],
  );

  const cancel = useCallback(
    async (callId: string) => {
      await confirm(callId, ToolConfirmationOutcome.Cancel);
    },
    [confirm],
  );

  return (
    <ToolActionsContext.Provider value={{ confirm, cancel, isDiffingEnabled }}>
      {children}
    </ToolActionsContext.Provider>
  );
};
