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
}

export const ApprovalModeIndicator: React.FC<ApprovalModeIndicatorProps> = ({
  approvalMode,
  isPlanEnabled,
}) => {
  let textColor = '';
  let textContent = '';
  let subText = '';

  switch (approvalMode) {
    case ApprovalMode.AUTO_EDIT:
      textColor = theme.status.warning;
      textContent = 'auto-edit';
      subText = 'shift + tab to enter default mode';
      break;
    case ApprovalMode.PLAN:
      textColor = theme.status.success;
      textContent = 'plan';
      subText = 'shift + tab to enter auto-edit mode';
      break;
    case ApprovalMode.YOLO:
      textColor = theme.status.error;
      textContent = 'YOLO';
      subText = 'shift + tab to enter auto-edit mode';
      break;
    case ApprovalMode.DEFAULT:
    default:
      textColor = theme.text.accent;
      textContent = '';
      subText = isPlanEnabled
        ? 'shift + tab to enter plan mode'
        : 'shift + tab to enter auto-edit mode';
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
