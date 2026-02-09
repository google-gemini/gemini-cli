/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  ApprovalMode,
  type Config,
  getAdminErrorMessage,
} from '@google/gemini-cli-core';
import { useKeypress } from './useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import type { HistoryItemWithoutId } from '../types.js';
import { MessageType } from '../types.js';

export interface UseApprovalModeIndicatorArgs {
  config: Config;
  addItem?: (item: HistoryItemWithoutId, timestamp: number) => void;
  onApprovalModeChange?: (mode: ApprovalMode) => void;
  isActive?: boolean;
}

export function useApprovalModeIndicator({
  config,
  addItem,
  onApprovalModeChange,
  isActive = true,
}: UseApprovalModeIndicatorArgs): ApprovalMode {
  const currentConfigValue = config.getApprovalMode();
  const [showApprovalMode, setApprovalMode] = useState(currentConfigValue);

  useEffect(() => {
    setApprovalMode(currentConfigValue);
  }, [currentConfigValue]);

  useKeypress(
    (key) => {
      let nextApprovalMode: ApprovalMode | undefined;

      if (keyMatchers[Command.TOGGLE_YOLO](key)) {
        if (
          config.isYoloModeDisabled() &&
          config.getApprovalMode() !== ApprovalMode.YOLO
        ) {
          if (addItem) {
            let text =
              'You cannot enter YOLO mode since it is disabled in your settings.';
            const adminSettings = config.getRemoteAdminSettings();
            const hasSettings =
              adminSettings && Object.keys(adminSettings).length > 0;
            if (hasSettings && !adminSettings.strictModeDisabled) {
              text = getAdminErrorMessage('YOLO mode', config);
            }

            addItem(
              {
                type: MessageType.WARNING,
                text,
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
      } else if (keyMatchers[Command.CYCLE_APPROVAL_MODE](key)) {
        const currentMode = config.getApprovalMode();
        switch (currentMode) {
          case ApprovalMode.DEFAULT:
            nextApprovalMode = config.isPlanEnabled()
              ? ApprovalMode.PLAN
              : ApprovalMode.AUTO_EDIT;
            break;
          case ApprovalMode.PLAN:
            nextApprovalMode = ApprovalMode.AUTO_EDIT;
            break;
          case ApprovalMode.AUTO_EDIT:
            nextApprovalMode = ApprovalMode.DEFAULT;
            break;
          case ApprovalMode.YOLO:
            nextApprovalMode = ApprovalMode.AUTO_EDIT;
            break;
          default:
        }
      }

      if (nextApprovalMode) {
        try {
          config.setApprovalMode(nextApprovalMode);
          // Update local state immediately for responsiveness
          setApprovalMode(nextApprovalMode);

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
    { isActive },
  );

  return showApprovalMode;
}
