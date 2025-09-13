/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { ApprovalMode } from '@google/gemini-cli-core';

interface AutoAcceptIndicatorProps {
  approvalMode: ApprovalMode;
}

export const AutoAcceptIndicator: React.FC<AutoAcceptIndicatorProps> = ({
  approvalMode,
}) => {
  let textColor = '';
  let textContent = '';
  let subText = '';

  switch (approvalMode) {
    case ApprovalMode.AUTO_EDIT:
      textColor = theme.status.warning;
      textContent = 'accepting edits';
      subText = ' (shift + tab to toggle)';
      break;
    case ApprovalMode.YOLO:
      textColor = theme.status.error;
      textContent = 'YOLO mode';
      subText = ' (ctrl + y to toggle)';
      break;
    case ApprovalMode.DEFAULT:
    default:
      break;
  }

  return (
    <Box>
      <Text color={textColor}>
        {textContent}
        {subText && <Text color={theme.text.secondary}>{subText}</Text>}
      </Text>
    </Box>
  );
};
