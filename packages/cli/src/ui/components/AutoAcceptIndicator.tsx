/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { Colors } from '../colors.js';
import { ApprovalMode } from '@google/gemini-cli-core';

interface AutoAcceptIndicatorProps {
  approvalMode: ApprovalMode;
}

export const AutoAcceptIndicator: React.FC<AutoAcceptIndicatorProps> = ({
  approvalMode,
}) => {
  const { t } = useTranslation('ui');
  let textColor = '';
  let textContent = '';
  let subText = '';

  switch (approvalMode) {
    case ApprovalMode.AUTO_EDIT:
      textColor = Colors.AccentGreen;
      textContent = t('autoAccept.acceptingEdits');
      subText = t('autoAccept.shiftTabToggle');
      break;
    case ApprovalMode.YOLO:
      textColor = Colors.AccentRed;
      textContent = t('autoAccept.yoloMode');
      subText = t('autoAccept.ctrlYToggle');
      break;
    case ApprovalMode.DEFAULT:
    default:
      break;
  }

  return (
    <Box>
      <Text color={textColor}>
        {textContent}
        {subText && <Text color={Colors.Gray}>{subText}</Text>}
      </Text>
    </Box>
  );
};
