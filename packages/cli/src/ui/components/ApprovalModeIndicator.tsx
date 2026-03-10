/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { ApprovalMode } from '@google/gemini-cli-core';
import { formatCommand } from '../key/keybindingUtils.js';
import { Command } from '../key/keyBindings.js';

interface ApprovalModeIndicatorProps {
  approvalMode: ApprovalMode;
  allowPlanMode?: boolean;
}

export const ApprovalModeIndicator: React.FC<ApprovalModeIndicatorProps> = ({
  approvalMode,
  allowPlanMode,
}) => {
  let textColor = '';
  let textContent = '';
  let subText = '';

  const cycleHint = formatCommand(Command.CYCLE_APPROVAL_MODE);
  const yoloHint = formatCommand(Command.TOGGLE_YOLO);

  switch (approvalMode) {
    case ApprovalMode.AUTO_EDIT:
      textColor = theme.status.warning;
      textContent = 'auto-accept edits';
      subText = allowPlanMode
        ? `${cycleHint} to plan`
        : `${cycleHint} to manual`;
      break;
    case ApprovalMode.PLAN:
      textColor = theme.status.success;
      textContent = 'plan';
      subText = `${cycleHint} to manual`;
      break;
    case ApprovalMode.YOLO:
      textColor = theme.status.error;
      textContent = 'YOLO';
      subText = yoloHint;
      break;
    case ApprovalMode.DEFAULT:
    default:
      textColor = theme.text.accent;
      textContent = '';
      subText = `${cycleHint} to accept edits`;
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
