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
import { Command } from '../key/keyMatchers.js';
import { useKeyMatchers } from './useKeyMatchers.js';
import { MessageType, type HistoryItemWithoutId } from '../types.js';

export interface UseApprovalModeIndicatorArgs {
  config: Config;
  addItem?: (item: HistoryItemWithoutId, timestamp: number) => void;
  onApprovalModeChange?: (mode: ApprovalMode) => void;
  isActive?: boolean;
  allowPlanMode?: boolean;
}

export function useApprovalModeIndicator({
  config,
  addItem,
  onApprovalModeChange,
  isActive = true,
  allowPlanMode = false,
}: UseApprovalModeIndicatorArgs): ApprovalMode {
  const keyMatchers = useKeyMatchers();
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
              'You cannot enter Full Access mode since it is disabled in your settings.';
            const adminSettings = config.getRemoteAdminSettings();
            const hasSettings =
              adminSettings && Object.keys(adminSettings).length > 0;
            if (hasSettings && !adminSettings.strictModeDisabled) {
              text = getAdminErrorMessage('Full Access mode', config);
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
        // Linear cycle (Claude Code style):
        //   DEFAULT → AUTO_EDIT → PLAN? → YOLO? → DEFAULT
        // PLAN is skipped if !allowPlanMode; YOLO is skipped when it is
        // disabled by admin/security settings or by untrusted folder.
        const currentMode = config.getApprovalMode();
        const yoloAvailable = !config.isYoloModeDisabled();
        switch (currentMode) {
          case ApprovalMode.DEFAULT:
            nextApprovalMode = ApprovalMode.AUTO_EDIT;
            break;
          case ApprovalMode.AUTO_EDIT:
            nextApprovalMode = allowPlanMode
              ? ApprovalMode.PLAN
              : yoloAvailable
                ? ApprovalMode.YOLO
                : ApprovalMode.DEFAULT;
            break;
          case ApprovalMode.PLAN:
            nextApprovalMode = yoloAvailable
              ? ApprovalMode.YOLO
              : ApprovalMode.DEFAULT;
            break;
          case ApprovalMode.YOLO:
            nextApprovalMode = ApprovalMode.DEFAULT;
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
                // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
