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
  allowYoloMode?: boolean;
}

const AUTO_GLYPH = '⏵⏵';

export const ApprovalModeIndicator: React.FC<ApprovalModeIndicatorProps> = ({
  approvalMode,
  allowPlanMode = false,
  allowYoloMode = true,
}) => {
  const cycleHint = formatCommand(Command.CYCLE_APPROVAL_MODE);

  let textColor = '';
  let textContent = '';
  let subText = '';

  switch (approvalMode) {
    case ApprovalMode.AUTO_EDIT:
      textColor = theme.status.warning;
      textContent = `${AUTO_GLYPH} accept edits on`;
      subText = allowPlanMode
        ? `${cycleHint} to plan`
        : allowYoloMode
          ? `${cycleHint} to auto mode`
          : `${cycleHint} to manual`;
      break;
    case ApprovalMode.PLAN:
      textColor = theme.status.success;
      textContent = 'plan mode on';
      subText = allowYoloMode
        ? `${cycleHint} to auto mode`
        : `${cycleHint} to manual`;
      break;
    case ApprovalMode.YOLO:
      textColor = theme.status.error;
      textContent = `${AUTO_GLYPH} auto mode on`;
      subText = `${cycleHint} to manual`;
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
