/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ToolCallStatus, mapCoreStatusToDisplayStatus } from '../../types.js';
import { GeminiRespondingSpinner } from '../GeminiRespondingSpinner.js';
import {
  SHELL_COMMAND_NAME,
  SHELL_NAME,
  TOOL_STATUS,
  SHELL_FOCUS_HINT_DELAY_MS,
} from '../../constants.js';
import { theme } from '../../semantic-colors.js';
import {
  type Config,
  SHELL_TOOL_NAME,
  isCompletedAskUserTool,
  type ToolResultDisplay,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';
import { useInactivityTimer } from '../../hooks/useInactivityTimer.js';
import { formatCommand } from '../../utils/keybindingUtils.js';
import { Command } from '../../../config/keyBindings.js';

export const STATUS_INDICATOR_WIDTH = 3;

/**
 * Returns true if the tool name corresponds to a shell tool.
 */
export function isShellTool(name: string): boolean {
  return (
    name === SHELL_COMMAND_NAME ||
    name === SHELL_NAME ||
    name === SHELL_TOOL_NAME
  );
}

/**
 * Returns true if the shell tool call is currently focusable.
 */
export function isThisShellFocusable(
  name: string,
  status: CoreToolCallStatus,
  config?: Config,
): boolean {
  return !!(
    isShellTool(name) &&
    status === CoreToolCallStatus.Executing &&
    config?.getEnableInteractiveShell()
  );
}

/**
 * Returns true if this specific shell tool call is currently focused.
 */
export function isThisShellFocused(
  name: string,
  status: CoreToolCallStatus,
  ptyId?: number,
  activeShellPtyId?: number | null,
  embeddedShellFocused?: boolean,
): boolean {
  return !!(
    isShellTool(name) &&
    status === CoreToolCallStatus.Executing &&
    ptyId === activeShellPtyId &&
    embeddedShellFocused
  );
}

/**
 * Hook to manage focus hint state.
 */
export function useFocusHint(
  isThisShellFocusable: boolean,
  isThisShellFocused: boolean,
  resultDisplay: ToolResultDisplay | undefined,
) {
  const [userHasFocused, setUserHasFocused] = useState(false);

  // Derive a stable reset key for the inactivity timer. For strings and arrays
  // (shell output), we use the length to capture updates without referential
  // identity issues or expensive deep comparisons.
  const resetKey =
    typeof resultDisplay === 'string'
      ? resultDisplay.length
      : Array.isArray(resultDisplay)
        ? resultDisplay.length
        : !!resultDisplay;

  const showFocusHint = useInactivityTimer(
    isThisShellFocusable,
    resetKey,
    SHELL_FOCUS_HINT_DELAY_MS,
  );

  useEffect(() => {
    if (isThisShellFocused) {
      setUserHasFocused(true);
    }
  }, [isThisShellFocused]);

  const shouldShowFocusHint =
    isThisShellFocusable && (showFocusHint || userHasFocused);

  return { shouldShowFocusHint };
}

/**
 * Component to render the focus hint.
 */
export const FocusHint: React.FC<{
  shouldShowFocusHint: boolean;
  isThisShellFocused: boolean;
}> = ({ shouldShowFocusHint, isThisShellFocused }) => {
  if (!shouldShowFocusHint) {
    return null;
  }

  return (
    <Box marginLeft={1} flexShrink={0}>
      <Text color={theme.text.accent}>
        {isThisShellFocused
          ? `(${formatCommand(Command.UNFOCUS_SHELL_INPUT)} to unfocus)`
          : `(${formatCommand(Command.FOCUS_SHELL_INPUT)} to focus)`}
      </Text>
    </Box>
  );
};

export type TextEmphasis = 'high' | 'medium' | 'low';

type ToolStatusIndicatorProps = {
  status: CoreToolCallStatus;
  name: string;
};

export const ToolStatusIndicator: React.FC<ToolStatusIndicatorProps> = ({
  status: coreStatus,
  name,
}) => {
  const status = mapCoreStatusToDisplayStatus(coreStatus);
  const isShell = isShellTool(name);
  const statusColor = isShell ? theme.ui.symbol : theme.status.warning;

  return (
    <Box minWidth={STATUS_INDICATOR_WIDTH}>
      {status === ToolCallStatus.Pending && (
        <Text color={theme.status.success}>{TOOL_STATUS.PENDING}</Text>
      )}
      {status === ToolCallStatus.Executing && (
        <GeminiRespondingSpinner
          spinnerType="toggle"
          nonRespondingDisplay={TOOL_STATUS.EXECUTING}
        />
      )}
      {status === ToolCallStatus.Success && (
        <Text color={theme.status.success} aria-label={'Success:'}>
          {TOOL_STATUS.SUCCESS}
        </Text>
      )}
      {status === ToolCallStatus.Confirming && (
        <Text color={statusColor} aria-label={'Confirming:'}>
          {TOOL_STATUS.CONFIRMING}
        </Text>
      )}
      {status === ToolCallStatus.Canceled && (
        <Text color={statusColor} aria-label={'Canceled:'} bold>
          {TOOL_STATUS.CANCELED}
        </Text>
      )}
      {status === ToolCallStatus.Error && (
        <Text color={theme.status.error} aria-label={'Error:'} bold>
          {TOOL_STATUS.ERROR}
        </Text>
      )}
    </Box>
  );
};

type ToolInfoProps = {
  name: string;
  description: string;
  status: CoreToolCallStatus;
  emphasis: TextEmphasis;
  progressMessage?: string;
  progressPercent?: number;
};

export const ToolInfo: React.FC<ToolInfoProps> = ({
  name,
  description,
  status: coreStatus,
  emphasis,
  progressMessage,
  progressPercent,
}) => {
  const status = mapCoreStatusToDisplayStatus(coreStatus);
  const nameColor = React.useMemo<string>(() => {
    switch (emphasis) {
      case 'high':
        return theme.text.primary;
      case 'medium':
        return theme.text.primary;
      case 'low':
        return theme.text.secondary;
      default: {
        const exhaustiveCheck: never = emphasis;
        return exhaustiveCheck;
      }
    }
  }, [emphasis]);

  // Hide description for completed Ask User tools (the result display speaks for itself)
  const isCompletedAskUser = isCompletedAskUserTool(name, status);

  let displayDescription = description;
  if (status === ToolCallStatus.Executing) {
    const parts: string[] = [];
    if (progressMessage) {
      parts.push(progressMessage);
    }
    if (progressPercent !== undefined) {
      parts.push(`${Math.round(progressPercent)}%`);
    }

    if (parts.length > 0) {
      const progressInfo = parts.join(' - ');
      displayDescription = description
        ? `${description} (${progressInfo})`
        : progressInfo;
    }
  }

  return (
    <Box overflow="hidden" height={1} flexGrow={1} flexShrink={1}>
      <Text strikethrough={status === ToolCallStatus.Canceled} wrap="truncate">
        <Text color={nameColor} bold>
          {name}
        </Text>
        {!isCompletedAskUser && (
          <>
            {' '}
            <Text color={theme.text.secondary}>{displayDescription}</Text>
          </>
        )}
      </Text>
    </Box>
  );
};

export const TrailingIndicator: React.FC = () => (
  <Text color={theme.text.primary} wrap="truncate">
    {' '}
    ←
  </Text>
);
