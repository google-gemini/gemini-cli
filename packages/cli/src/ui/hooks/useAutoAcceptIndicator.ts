/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { ApprovalMode, type Config } from '@google/gemini-cli-core';
import { useKeypress } from './useKeypress.js';

export interface UseAutoAcceptIndicatorArgs {
  config: Config;
}

export function useAutoAcceptIndicator({
  config,
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
        config.setApprovalMode(nextApprovalMode);
        // Update local state immediately for responsiveness
        setShowAutoAcceptIndicator(nextApprovalMode);
      }
    },
    { isActive: true },
  );

  return showAutoAcceptIndicator;
}
