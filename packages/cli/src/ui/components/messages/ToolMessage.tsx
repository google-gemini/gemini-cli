/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { IndividualToolCallDisplay } from '../../types.js';
import { StickyHeader } from '../StickyHeader.js';
import { ToolResultDisplay } from './ToolResultDisplay.js';
import {
  ToolStatusIndicator,
  ToolInfo,
  TrailingIndicator,
  type TextEmphasis,
  STATUS_INDICATOR_WIDTH,
} from './ToolShared.js';
import {
  SHELL_COMMAND_NAME,
  SHELL_FOCUS_HINT_DELAY_MS,
} from '../../constants.js';
import { theme } from '../../semantic-colors.js';
import type { Config } from '@google/gemini-cli-core';
import { useInactivityTimer } from '../../hooks/useInactivityTimer.js';
import { ToolCallStatus } from '../../types.js';
import { ShellInputPrompt } from '../ShellInputPrompt.js';

export type { TextEmphasis };

export interface ToolMessageProps extends IndividualToolCallDisplay {
  availableTerminalHeight?: number;
  terminalWidth: number;
  emphasis?: TextEmphasis;
  renderOutputAsMarkdown?: boolean;
  isFirst: boolean;
  borderColor: string;
  borderDimColor: boolean;
  activeShellPtyId?: number | null;
  embeddedShellFocused?: boolean;
  ptyId?: number;
  config?: Config;
}

export const ToolMessage: React.FC<ToolMessageProps> = ({
  name,
  description,
  resultDisplay,
  status,
  availableTerminalHeight,
  terminalWidth,
  emphasis = 'medium',
  renderOutputAsMarkdown = true,
  isFirst,
  borderColor,
  borderDimColor,
  activeShellPtyId,
  embeddedShellFocused,
  ptyId,
  config,
}) => {
  const isThisShellFocused =
    (name === SHELL_COMMAND_NAME || name === 'Shell') &&
    status === ToolCallStatus.Executing &&
    ptyId === activeShellPtyId &&
    embeddedShellFocused;

  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [userHasFocused, setUserHasFocused] = useState(false);
  const showFocusHint = useInactivityTimer(
    !!lastUpdateTime,
    lastUpdateTime ? lastUpdateTime.getTime() : 0,
    SHELL_FOCUS_HINT_DELAY_MS,
  );

  useEffect(() => {
    if (resultDisplay) {
      setLastUpdateTime(new Date());
    }
  }, [resultDisplay]);

  useEffect(() => {
    if (isThisShellFocused) {
      setUserHasFocused(true);
    }
  }, [isThisShellFocused]);

  const isThisShellFocusable =
    (name === SHELL_COMMAND_NAME || name === 'Shell') &&
    status === ToolCallStatus.Executing &&
    config?.getEnableInteractiveShell();

  const shouldShowFocusHint =
    isThisShellFocusable && (showFocusHint || userHasFocused);

  return (
    // It is crucial we don't replace this <> with a Box because otherwise the
    // sticky header inside it would be sticky to that box rather than to the
    // parent component of this ToolMessage.
    <>
      <StickyHeader
        width={terminalWidth}
        isFirst={isFirst}
        borderColor={borderColor}
        borderDimColor={borderDimColor}
      >
        <ToolStatusIndicator status={status} name={name} />
        <ToolInfo
          name={name}
          status={status}
          description={description}
          emphasis={emphasis}
        />
        {shouldShowFocusHint && (
          <Box marginLeft={1} flexShrink={0}>
            <Text color={theme.text.accent}>
              {isThisShellFocused ? '(Focused)' : '(tab to focus)'}
            </Text>
          </Box>
        )}
        {emphasis === 'high' && <TrailingIndicator />}
      </StickyHeader>
      <Box
        width={terminalWidth}
        borderStyle="round"
        borderColor={borderColor}
        borderDimColor={borderDimColor}
        borderTop={false}
        borderBottom={false}
        borderLeft={true}
        borderRight={true}
        paddingX={1}
        flexDirection="column"
      >
        <ToolResultDisplay
          resultDisplay={resultDisplay}
          availableTerminalHeight={availableTerminalHeight}
          terminalWidth={terminalWidth}
          renderOutputAsMarkdown={renderOutputAsMarkdown}
        />
        {isThisShellFocused && config && (
          <Box paddingLeft={STATUS_INDICATOR_WIDTH} marginTop={1}>
            <ShellInputPrompt
              activeShellPtyId={activeShellPtyId ?? null}
              focus={embeddedShellFocused}
            />
          </Box>
        )}
      </Box>
    </>
  );
};
