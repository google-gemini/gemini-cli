/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FC } from 'react';
import { useRef } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { ApprovalMode } from '@google/gemini-cli-core';
import { formatCommand } from '../key/keybindingUtils.js';
import { Command } from '../key/keyBindings.js';
import { useMouseClick } from '../hooks/useMouseClick.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useUIState } from '../contexts/UIStateContext.js';

interface ApprovalModeIndicatorProps {
  approvalMode: ApprovalMode;
  allowPlanMode?: boolean;
}

export const ApprovalModeIndicator: FC<ApprovalModeIndicatorProps> = ({
  approvalMode,
  allowPlanMode,
}) => {
  const { mouseMode } = useUIState();
  const { cycleApprovalMode } = useUIActions();
  const boxRef = useRef(null);

  /**
   * Click handler for switching approval modes.
   * See: https://github.com/google-gemini/gemini-cli/issues/27035
   */
  useMouseClick(boxRef, () => {
    cycleApprovalMode();
  });

  let textColor = '';
  let textContent = '';
  let subText = '';

  const cycleHint = formatCommand(Command.CYCLE_APPROVAL_MODE);
  const clickHint = mouseMode ? 'click or ' : '';
  const yoloHint = formatCommand(Command.TOGGLE_YOLO);

  switch (approvalMode) {
    case ApprovalMode.AUTO_EDIT:
      textColor = theme.status.warning;
      textContent = 'auto-accept edits';
      subText = allowPlanMode
        ? `${clickHint}${cycleHint} to plan`
        : `${clickHint}${cycleHint} to manual`;
      break;
    case ApprovalMode.PLAN:
      textColor = theme.status.success;
      textContent = 'plan';
      subText = `${clickHint}${cycleHint} to manual`;
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
      subText = `${clickHint}${cycleHint} to accept edits`;
      break;
  }

  return (
    <Box ref={boxRef}>
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
