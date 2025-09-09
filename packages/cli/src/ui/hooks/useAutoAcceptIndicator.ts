/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { ApprovalMode, type Config } from '@google/gemini-cli-core';
import { useKeypress } from './useKeypress.js';
import type { HistoryItemWithoutId } from '../types.js';
import { MessageType } from '../types.js';

export interface UseAutoAcceptIndicatorArgs {
  config: Config;
  addItem: (item: HistoryItemWithoutId, timestamp: number) => void;
}

export function useAutoAcceptIndicator({
  config,
  addItem,
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
        } catch (e) {
          addItem(
            {
              type: MessageType.INFO,
              text: (e as Error).message,
            },
            Date.now(),
          );
        }
      }
    },
    { isActive: true },
  );

  return showAutoAcceptIndicator;
}
