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
  isThisShellFocusable as checkIsShellFocusable,
  isThisShellFocused as checkIsShellFocused,
  useFocusHint,
  FocusHint,
} from './ToolShared.js';
import type { ToolMessageProps } from './ToolMessage.js';
import { ACTIVE_SHELL_MAX_LINES } from '../../constants.js';
import { useAlternateBuffer } from '../../hooks/useAlternateBuffer.js';
import { useUIState } from '../../contexts/UIStateContext.js';
import { type Config } from '@google/gemini-cli-core';
import { calculateShellMaxLines } from '../../utils/toolLayoutUtils.js';

export interface ShellToolMessageProps extends ToolMessageProps {
  config?: Config;
  isExpandable?: boolean;
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

  ptyId,

  config,

  isFirst,

  borderColor,

  borderDimColor,
  isExpandable,
}) => {
  const {
    activePtyId: activeShellPtyId,
    embeddedShellFocused,
    constrainHeight,
  } = useUIState();
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
          maxLines={calculateShellMaxLines({
            status,
            isAlternateBuffer,
            isThisShellFocused,
            availableTerminalHeight,
            constrainHeight,
            isExpandable,
          })}
        />
        {isThisShellFocused && config && (
          <ShellInputPrompt
            activeShellPtyId={activeShellPtyId ?? null}
            focus={embeddedShellFocused}
            scrollPageSize={availableTerminalHeight ?? ACTIVE_SHELL_MAX_LINES}
          />
        )}
      </Box>
    </>
  );
};
