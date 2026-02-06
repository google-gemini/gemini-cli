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
}

export const ApprovalModeIndicator: React.FC<ApprovalModeIndicatorProps> = ({
  approvalMode,
}) => {
  let textColor = '';
  let textContent = '';
  let subText = '';

  switch (approvalMode) {
    case ApprovalMode.AUTO_EDIT:
      textColor = theme.status.warning;
      textContent = 'accept edits';
      subText = 'shift+tab';
      break;
    case ApprovalMode.PLAN:
      textColor = theme.status.success;
      textContent = 'plan';
      subText = 'shift+tab';
      break;
    case ApprovalMode.YOLO:
      textColor = theme.status.error;
      textContent = 'YOLO';
      subText = 'shift+tab';
      break;
    case ApprovalMode.DEFAULT:
    default:
      textColor = theme.text.accent;
      textContent = '';
      subText = 'shift+tab for modes';
      break;
  }

  return (
    <Box>
      <Text color={textColor}>
        {textContent}
        {textContent && subText && ' '}
        {subText && <Text color={theme.text.secondary}>{subText}</Text>}
      </Text>
    </Box>
  );
};
