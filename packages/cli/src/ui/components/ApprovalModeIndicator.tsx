/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { theme } from '../semantic-colors.js';
import { ApprovalMode } from '@google/gemini-cli-core';

interface ApprovalModeIndicatorProps {
  approvalMode: ApprovalMode;
}

export const ApprovalModeIndicator: React.FC<ApprovalModeIndicatorProps> = ({
  approvalMode,
}) => {
  const { t } = useTranslation('ui');
  let textColor = '';
  let textContent = '';
  let subText = '';

  switch (approvalMode) {
    case ApprovalMode.AUTO_EDIT:
      textColor = theme.status.warning;
      textContent = t('approvalMode.acceptingEdits');
      subText = t('approvalMode.cycleHint');
      break;
    case ApprovalMode.PLAN:
      textColor = theme.status.success;
      textContent = t('approvalMode.planMode');
      subText = t('approvalMode.cycleHint');
      break;
    case ApprovalMode.YOLO:
      textColor = theme.status.error;
      textContent = t('approvalMode.yoloMode');
      subText = t('approvalMode.toggleHint');
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
