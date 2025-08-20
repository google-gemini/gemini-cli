/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  ApprovalMode,
  type Config,
  ToolConfirmationOutcome,
} from '@google/gemini-cli-core';
import { useKeypress } from './useKeypress.js';
import type { HistoryItemWithoutId } from '../types.js';
import { MessageType } from '../types.js';

export interface UseAutoAcceptIndicatorArgs {
  config: Config;
  addItem?: (item: HistoryItemWithoutId, timestamp: number) => void;
  pendingToolCalls?: Array<{
    status: string;
    request: { callId: string; name: string };
    confirmationDetails?: {
      onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
    };
  }>;
}

export function useAutoAcceptIndicator({
  config,
  addItem,
  pendingToolCalls = [],
}: UseAutoAcceptIndicatorArgs): ApprovalMode {
  const currentConfigValue = config.getApprovalMode();
  const [showAutoAcceptIndicator, setShowAutoAcceptIndicator] =
    useState(currentConfigValue);

  useEffect(() => {
    setShowAutoAcceptIndicator(currentConfigValue);
  }, [currentConfigValue]);

  useKeypress(
    (key) => {
      let nextApprovalMode: ApprovalMode | undefined;

      if (key.ctrl && key.name === 'y') {
        nextApprovalMode =
          config.getApprovalMode() === ApprovalMode.YOLO
            ? ApprovalMode.DEFAULT
            : ApprovalMode.YOLO;
      } else if (key.shift && key.name === 'tab') {
        nextApprovalMode =
          config.getApprovalMode() === ApprovalMode.AUTO_EDIT
            ? ApprovalMode.DEFAULT
            : ApprovalMode.AUTO_EDIT;
      }

      if (nextApprovalMode) {
        try {
          config.setApprovalMode(nextApprovalMode);
          // Update local state immediately for responsiveness
          setShowAutoAcceptIndicator(nextApprovalMode);

          // Auto-approve pending tool calls when switching to auto-approval modes
          if (
            nextApprovalMode === ApprovalMode.YOLO ||
            nextApprovalMode === ApprovalMode.AUTO_EDIT
          ) {
            let awaitingApprovalCalls = pendingToolCalls.filter(
              (call) =>
                call.status === 'awaiting_approval' && call.confirmationDetails,
            );

            // For AUTO_EDIT mode, only approve edit tools (replace, write_file)
            if (nextApprovalMode === ApprovalMode.AUTO_EDIT) {
              awaitingApprovalCalls = awaitingApprovalCalls.filter(
                (call) =>
                  call.request.name === 'replace' ||
                  call.request.name === 'write_file',
              );
            }

            awaitingApprovalCalls.forEach(async (call) => {
              if (call.confirmationDetails?.onConfirm) {
                try {
                  await call.confirmationDetails.onConfirm(
                    ToolConfirmationOutcome.ProceedOnce,
                  );
                } catch (error) {
                  console.error(
                    `Failed to auto-approve tool call ${call.request.callId}:`,
                    error,
                  );
                }
              }
            });
          }
        } catch (e) {
          if (addItem) {
            addItem(
              {
                type: MessageType.INFO,
                text: (e as Error).message,
              },
              Date.now(),
            );
          }
        }
      }
    },
    { isActive: true },
  );

  return showAutoAcceptIndicator;
}
