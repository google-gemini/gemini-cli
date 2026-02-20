/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
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
  allowPlanMode?: boolean;
}

export function useApprovalModeIndicator({
  config,
  addItem,
  onApprovalModeChange,
  isActive = true,
  allowPlanMode = false,
}: UseApprovalModeIndicatorArgs): ApprovalMode {
  const currentConfigValue = config.getApprovalMode();
  const [showApprovalMode, setApprovalMode] = useState(currentConfigValue);
  const initialModeRef = useRef<ApprovalMode | null>(null);

  useEffect(() => {
    setApprovalMode(currentConfigValue);
  }, [currentConfigValue]);

  useEffect(() => {
    if (initialModeRef.current === null) {
      const mode = config.getApprovalMode();
      initialModeRef.current =
        mode === ApprovalMode.PLAN ? ApprovalMode.DEFAULT : mode;
    }
  }, [config]);

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
        const initial = initialModeRef.current ?? ApprovalMode.DEFAULT;
        const fromYolo = initial === ApprovalMode.YOLO;

        switch (currentMode) {
          case ApprovalMode.DEFAULT:
            nextApprovalMode =
              allowPlanMode && !fromYolo
                ? ApprovalMode.PLAN
                : ApprovalMode.AUTO_EDIT;
            break;
          case ApprovalMode.AUTO_EDIT:
            nextApprovalMode =
              fromYolo && allowPlanMode
                ? ApprovalMode.PLAN
                : ApprovalMode.DEFAULT;
            break;
          case ApprovalMode.PLAN:
            nextApprovalMode = fromYolo
              ? ApprovalMode.YOLO
              : ApprovalMode.AUTO_EDIT;
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
          setApprovalMode(nextApprovalMode);
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
