/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { ApprovalMode } from '@google/gemini-cli-core';

interface ApprovalModeIndicatorProps {
  approvalMode: ApprovalMode;
  isPlanEnabled?: boolean;
  isDeepWorkEnabled?: boolean;
}

export const ApprovalModeIndicator: React.FC<ApprovalModeIndicatorProps> = ({
  approvalMode,
  isPlanEnabled,
  isDeepWorkEnabled,
}) => {
  let textColor = '';
  let textContent = '';
  let subText = '';

  switch (approvalMode) {
    case ApprovalMode.AUTO_EDIT:
      textColor = theme.status.warning;
      textContent = 'auto-accept edits';
      subText = 'shift+tab to manual';
      break;
    case ApprovalMode.PLAN:
      textColor = theme.status.success;
      textContent = 'plan';
      subText = isDeepWorkEnabled
        ? 'shift+tab to deep work'
        : 'shift+tab to accept edits';
      break;
    case ApprovalMode.DEEP_WORK:
      textColor = theme.status.success;
      textContent = 'deep work';
      subText = 'shift+tab to accept edits';
      break;
    case ApprovalMode.YOLO:
      textColor = theme.status.error;
      textContent = 'YOLO';
      subText = 'ctrl+y';
      break;
    case ApprovalMode.DEFAULT:
    default:
      textColor = theme.text.accent;
      textContent = '';
      subText = isPlanEnabled
        ? 'shift+tab to plan'
        : isDeepWorkEnabled
          ? 'shift+tab to deep work'
          : 'shift+tab to accept edits';
      break;
  }

  return (
    <Box>
      <Text color={textColor}>
        {textContent ? textContent : null}
        {subText ? (
          <Text color={theme.text.secondary}>
            {textContent ? ' ' : ''}
            {subText}
          </Text>
        ) : null}
      </Text>
    </Box>
  );
};
