/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, type DOMElement } from 'ink';
import { ShellInputPrompt } from '../ShellInputPrompt.js';
import { StickyHeader } from '../StickyHeader.js';
import { useUIActions } from '../../contexts/UIActionsContext.js';
import { useMouseClick } from '../../hooks/useMouseClick.js';
import { ToolResultDisplay } from './ToolResultDisplay.js';
import {
  ToolStatusIndicator,
  ToolInfo,
  TrailingIndicator,
  STATUS_INDICATOR_WIDTH,
  isThisShellFocusable as checkIsShellFocusable,
  isThisShellFocused as checkIsShellFocused,
  useFocusHint,
  FocusHint,
} from './ToolShared.js';
import type { ToolMessageProps } from './ToolMessage.js';
import { ToolCallStatus } from '../../types.js';
import {
  ACTIVE_SHELL_MAX_LINES,
  COMPLETED_SHELL_MAX_LINES,
} from '../../constants.js';
import { useAlternateBuffer } from '../../hooks/useAlternateBuffer.js';
import type { Config } from '@google/gemini-cli-core';

export interface ShellToolMessageProps extends ToolMessageProps {
  activeShellPtyId?: number | null;
  embeddedShellFocused?: boolean;
  config?: Config;
}

export const ShellToolMessage: React.FC<ShellToolMessageProps> = ({
  name,

  description,

  resultDisplay,

  status,

  availableTerminalHeight,

  terminalWidth,

  emphasis = 'medium',

  renderOutputAsMarkdown = true,

  activeShellPtyId,

  embeddedShellFocused,

  ptyId,

  config,

  isFirst,

  borderColor,

  borderDimColor,
}) => {
  const isAlternateBuffer = useAlternateBuffer();
  const isThisShellFocused = checkIsShellFocused(
    name,
    status,
    ptyId,
    activeShellPtyId,
    embeddedShellFocused,
  );

  const { setEmbeddedShellFocused } = useUIActions();
  const wasFocusedRef = React.useRef(false);

  React.useEffect(() => {
    if (isThisShellFocused) {
      wasFocusedRef.current = true;
    } else if (wasFocusedRef.current) {
      if (embeddedShellFocused) {
        setEmbeddedShellFocused(false);
      }
      wasFocusedRef.current = false;
    }
  }, [isThisShellFocused, embeddedShellFocused, setEmbeddedShellFocused]);

  const headerRef = React.useRef<DOMElement>(null);

  const contentRef = React.useRef<DOMElement>(null);

  // The shell is focusable if it's the shell command, it's executing, and the interactive shell is enabled.

  const isThisShellFocusable = checkIsShellFocusable(name, status, config);

  const handleFocus = () => {
    if (isThisShellFocusable) {
      setEmbeddedShellFocused(true);
    }
  };

  useMouseClick(headerRef, handleFocus, { isActive: !!isThisShellFocusable });

  useMouseClick(contentRef, handleFocus, { isActive: !!isThisShellFocusable });

  const { shouldShowFocusHint } = useFocusHint(
    isThisShellFocusable,
    isThisShellFocused,
    resultDisplay,
  );

  return (
    <>
      <StickyHeader
        width={terminalWidth}
        isFirst={isFirst}
        borderColor={borderColor}
        borderDimColor={borderDimColor}
        containerRef={headerRef}
      >
        <ToolStatusIndicator status={status} name={name} />

        <ToolInfo
          name={name}
          status={status}
          description={description}
          emphasis={emphasis}
        />

        <FocusHint
          shouldShowFocusHint={shouldShowFocusHint}
          isThisShellFocused={isThisShellFocused}
        />

        {emphasis === 'high' && <TrailingIndicator />}
      </StickyHeader>

      <Box
        ref={contentRef}
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
          hasFocus={isThisShellFocused}
          maxLines={getShellMaxLines(
            status,
            isAlternateBuffer,
            isThisShellFocused,
            availableTerminalHeight,
          )}
        />
        {isThisShellFocused && config && (
          <Box paddingLeft={STATUS_INDICATOR_WIDTH} marginTop={1}>
            <ShellInputPrompt
              activeShellPtyId={activeShellPtyId ?? null}
              focus={embeddedShellFocused}
              scrollPageSize={availableTerminalHeight ?? ACTIVE_SHELL_MAX_LINES}
            />
          </Box>
        )}
      </Box>
    </>
  );
};

/**
 * Calculates the maximum number of lines to display for shell output.
 *
 * For completed processes (Success, Error, Canceled), it returns COMPLETED_SHELL_MAX_LINES.
 * For active processes, it returns the available terminal height if in alternate buffer mode
 * and focused. Otherwise, it returns ACTIVE_SHELL_MAX_LINES.
 *
 * This function ensures a finite number of lines is always returned to prevent performance issues.
 */
function getShellMaxLines(
  status: ToolCallStatus,
  isAlternateBuffer: boolean,
  isThisShellFocused: boolean,
  availableTerminalHeight: number | undefined,
): number {
  if (
    status === ToolCallStatus.Success ||
    status === ToolCallStatus.Error ||
    status === ToolCallStatus.Canceled
  ) {
    return COMPLETED_SHELL_MAX_LINES;
  }

  if (availableTerminalHeight === undefined) {
    return ACTIVE_SHELL_MAX_LINES;
  }

  const maxLinesBasedOnHeight = Math.max(1, availableTerminalHeight - 2);

  if (isAlternateBuffer && isThisShellFocused) {
    return maxLinesBasedOnHeight;
  }

  return Math.min(maxLinesBasedOnHeight, ACTIVE_SHELL_MAX_LINES);
}
