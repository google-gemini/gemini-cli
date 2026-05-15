/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
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

export interface UseApprovalModeIndicatorResult {
  approvalMode: ApprovalMode;
  cycleApprovalMode: () => void;
  toggleYolo: () => void;
}

export function useApprovalModeIndicator({
  config,
  addItem,
  onApprovalModeChange,
  isActive = true,
  allowPlanMode = false,
}: UseApprovalModeIndicatorArgs): UseApprovalModeIndicatorResult {
  const keyMatchers = useKeyMatchers();
  const currentConfigValue = config.getApprovalMode();
  const [showApprovalMode, setApprovalMode] = useState(currentConfigValue);

  useEffect(() => {
    setApprovalMode(currentConfigValue);
  }, [currentConfigValue]);

  const toggleYolo = useCallback(() => {
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
    const nextApprovalMode =
      config.getApprovalMode() === ApprovalMode.YOLO
        ? ApprovalMode.DEFAULT
        : ApprovalMode.YOLO;

    try {
      config.setApprovalMode(nextApprovalMode);
      setApprovalMode(nextApprovalMode);
      onApprovalModeChange?.(nextApprovalMode);
    } catch (e) {
      if (addItem) {
        addItem(
          {
            type: MessageType.INFO,
            text: e instanceof Error ? e.message : String(e),
          },
          Date.now(),
        );
      }
    }
  }, [config, addItem, onApprovalModeChange]);

  const cycleApprovalMode = useCallback(() => {
    const currentMode = config.getApprovalMode();
    let nextApprovalMode: ApprovalMode | undefined;
    switch (currentMode) {
      case ApprovalMode.DEFAULT:
        nextApprovalMode = ApprovalMode.AUTO_EDIT;
        break;
      case ApprovalMode.AUTO_EDIT:
        nextApprovalMode = allowPlanMode
          ? ApprovalMode.PLAN
          : ApprovalMode.DEFAULT;
        break;
      case ApprovalMode.PLAN:
        nextApprovalMode = ApprovalMode.DEFAULT;
        break;
      case ApprovalMode.YOLO:
        nextApprovalMode = ApprovalMode.AUTO_EDIT;
        break;
      default:
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
              text: e instanceof Error ? e.message : String(e),
            },
            Date.now(),
          );
        }
      }
    }
  }, [config, allowPlanMode, onApprovalModeChange, addItem]);

  useKeypress(
    (key) => {
      if (keyMatchers[Command.TOGGLE_YOLO](key)) {
        toggleYolo();
      } else if (keyMatchers[Command.CYCLE_APPROVAL_MODE](key)) {
        cycleApprovalMode();
      }
    },
    { isActive },
  );

  return {
    approvalMode: showApprovalMode,
    cycleApprovalMode,
    toggleYolo,
  };
}
