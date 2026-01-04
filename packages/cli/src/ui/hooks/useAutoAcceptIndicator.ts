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
  addItem?: (item: HistoryItemWithoutId, timestamp: number) => void;
  onApprovalModeChange?: (mode: ApprovalMode) => void;
}

export function useAutoAcceptIndicator({
  config,
  addItem,
  onApprovalModeChange,
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
        if (
          config.isYoloModeDisabled() &&
          config.getApprovalMode() !== ApprovalMode.YOLO
        ) {
          if (addItem) {
            addItem(
              {
                type: MessageType.WARNING,
                text: 'You cannot enter YOLO mode since it is disabled in your settings.',
              },
              Date.now(),
            );
          }
          return;
        }
        nextApprovalMode =
          config.getApprovalMode() === ApprovalMode.YOLO
            ? ApprovalMode.DEFAULT
            : ApprovalMode.YOLO;
      } else if (key.shift && key.name === 'tab') {
        // Cycle through: DEFAULT -> AUTO_EDIT -> PLAN -> DEFAULT
        const current = config.getApprovalMode();
        if (current === ApprovalMode.DEFAULT) {
          nextApprovalMode = ApprovalMode.AUTO_EDIT;
        } else if (current === ApprovalMode.AUTO_EDIT) {
          nextApprovalMode = ApprovalMode.PLAN;
        } else if (current === ApprovalMode.PLAN) {
          nextApprovalMode = ApprovalMode.DEFAULT;
        }
      }

      if (nextApprovalMode) {
        try {
          config.setApprovalMode(nextApprovalMode);
          // Update local state immediately for responsiveness
          setShowAutoAcceptIndicator(nextApprovalMode);

          // Notify the central handler about the approval mode change
          onApprovalModeChange?.(nextApprovalMode);
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
