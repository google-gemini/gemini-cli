/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { ApprovalMode } from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';

import {
  MODE_HEADER_SHELL,
  MODE_HEADER_YOLO,
  MODE_HEADER_DEFAULT,
} from '../textConstants.js';

export interface UnifiedModeIndicatorProps {
  approvalMode: ApprovalMode;
  shellModeActive: boolean;
  renderMarkdown: boolean;
}

/**
 * Returns the dynamic header label for the mode section.
 */
export function getModeHeaderLabel(
  approvalMode: ApprovalMode,
  shellModeActive: boolean,
): string {
  if (shellModeActive) {
    return MODE_HEADER_SHELL;
  }
  if (approvalMode === ApprovalMode.YOLO) {
    return MODE_HEADER_YOLO;
  }
  return MODE_HEADER_DEFAULT;
}

/**
 * A unified indicator that handles ApprovalMode, ShellMode, and RawMarkdownMode.
 * It enforces a visual hierarchy where special modes like Shell and YOLO
 * obscure the background mode.
 */
export const UnifiedModeIndicator: React.FC<UnifiedModeIndicatorProps> = ({
  approvalMode,
  shellModeActive,
  renderMarkdown,
}) => {
  const parts: React.ReactNode[] = [];

  // 1. Primary Mode (Shell > YOLO > Others)
  let modeTextColor = theme.text.accent;
  let modeText = 'manual';

  if (shellModeActive) {
    modeTextColor = theme.ui.symbol;
    modeText = 'shell';
  } else if (approvalMode === ApprovalMode.YOLO) {
    modeTextColor = theme.status.error;
    modeText = 'YOLO';
  } else {
    switch (approvalMode) {
      case ApprovalMode.AUTO_EDIT:
        modeTextColor = theme.status.warning;
        modeText = 'auto-accept';
        break;
      case ApprovalMode.PLAN:
        modeTextColor = theme.status.success;
        modeText = 'plan';
        break;
      case ApprovalMode.DEFAULT:
      default:
        modeTextColor = theme.text.accent;
        modeText = 'manual';
        break;
    }
  }

  parts.push(
    <Text key="mode" color={modeTextColor}>
      {modeText}
    </Text>,
  );

  // 2. Secondary Modifier: Raw Markdown Mode
  if (!renderMarkdown) {
    parts.push(
      <Text key="raw" color={theme.text.secondary}>
        raw
      </Text>,
    );
  }

  // Join parts with middle dot separator
  const renderedParts: React.ReactNode[] = [];
  parts.forEach((part, index) => {
    if (index > 0) {
      renderedParts.push(
        <Text key={`sep-${index}`} color={theme.ui.comment}>
          {' · '}
        </Text>,
      );
    }
    renderedParts.push(part);
  });

  return <Box>{renderedParts}</Box>;
};
