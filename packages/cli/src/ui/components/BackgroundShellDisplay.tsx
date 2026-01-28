/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useEffect, useState, useRef } from 'react';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { theme } from '../semantic-colors.js';
import {
  ShellExecutionService,
  type AnsiOutput,
  type AnsiLine,
  type AnsiToken,
} from '@google/gemini-cli-core';
import { type BackgroundShell } from '../hooks/shellCommandProcessor.js';
import { Command, keyMatchers } from '../keyMatchers.js';
import { useKeypress } from '../hooks/useKeypress.js';
import {
  ScrollableList,
  type ScrollableListRef,
} from './shared/ScrollableList.js';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from './shared/RadioButtonSelect.js';

interface BackgroundShellDisplayProps {
  shells: Map<number, BackgroundShell>;
  activePid: number;
  width: number;
  height: number;
  isFocused: boolean;
  isListOpenProp: boolean;
}

const CONTENT_PADDING_X = 1;
const RIGHT_TEXT = 'Ctrl+B Hide | Ctrl+K Kill';
const BORDER_WIDTH = 2; // Left and Right border
const HEADER_HEIGHT = 3; // 2 for border, 1 for header
const TAB_PADDING = 2; // Spaces around tab text
const TAB_DISPLAY_HORIZONTAL_PADDING = 4;

const formatShellCommandForDisplay = (command: string, maxWidth: number) => {
  const commandFirstLine = command.split('\n')[0];
  return commandFirstLine.length > maxWidth
    ? `${commandFirstLine.substring(0, maxWidth - 3)}...`
    : commandFirstLine;
};

export const BackgroundShellDisplay = ({
  shells,
  activePid,
  width,
  height,
  isFocused,
  isListOpenProp,
}: BackgroundShellDisplayProps) => {
  const {
    dismissBackgroundShell,
    setActiveBackgroundShellPid,
    setIsBackgroundShellListOpen,
    handleWarning,
    setEmbeddedShellFocused,
  } = useUIActions();
  const activeShell = shells.get(activePid);
  const [output, setOutput] = useState<string | AnsiOutput>(
    activeShell?.output || '',
  );
  const [highlightedPid, setHighlightedPid] = useState<number | null>(
    activePid,
  );
  // Remove manual listSelectionIndex as RadioButtonSelect handles it
  // const [listSelectionIndex, setListSelectionIndex] = useState(0);
  const outputRef = useRef<ScrollableListRef<AnsiLine | string>>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!activePid) return;

    const ptyWidth = Math.max(1, width - BORDER_WIDTH - CONTENT_PADDING_X * 2);
    const ptyHeight = Math.max(1, height - HEADER_HEIGHT);
    ShellExecutionService.resizePty(activePid, ptyWidth, ptyHeight);
  }, [activePid, width, height]);

  useEffect(() => {
    if (!activePid) {
      setOutput('');
      return;
    }

    // Set initial output from the shell object
    const shell = shells.get(activePid);
    if (shell) {
      setOutput(shell.output);
    }

    subscribedRef.current = false;

    // Subscribe to live updates for the active shell
    const unsubscribe = ShellExecutionService.subscribe(activePid, (event) => {
      if (event.type === 'data') {
        if (typeof event.chunk === 'string') {
          if (!subscribedRef.current) {
            // Initial synchronous update contains full history
            setOutput(event.chunk);
          } else {
            // Subsequent updates are deltas for child_process
            setOutput((prev) =>
              typeof prev === 'string' ? prev + event.chunk : event.chunk,
            );
          }
        } else {
          // PTY always sends full AnsiOutput
          setOutput(event.chunk);
        }
      }
    });

    subscribedRef.current = true;

    return () => {
      unsubscribe();
      subscribedRef.current = false;
    };
  }, [activePid, shells]);

  useEffect(() => {
    if (!isListOpenProp && outputRef.current && isAtBottom) {
      outputRef.current.scrollToEnd();
    }
  }, [output, isListOpenProp, isAtBottom]);

  // Sync highlightedPid with activePid when list opens
  useEffect(() => {
    if (isListOpenProp) {
      setHighlightedPid(activePid);
    }
  }, [isListOpenProp, activePid]);

  useKeypress(
    (key) => {
      if (!activeShell) return;

      // Handle Shift+Tab to focus out
      if (key.name === 'tab' && (key.shift || isListOpenProp)) {
        setEmbeddedShellFocused(false);
        return true;
      }

      // Handle Tab to warn but propagate
      if (key.name === 'tab' && !key.shift) {
        handleWarning('Press Shift+Tab to focus out.');
        // Fall through to allow Tab to be sent to the shell
      }

      if (isListOpenProp) {
        // Navigation (Up/Down/Enter) is handled by RadioButtonSelect
        // We only handle special keys not consumed by RadioButtonSelect or overriding them if needed
        // RadioButtonSelect handles Enter -> onSelect

        if (key.name === 'escape') {
          setIsBackgroundShellListOpen(false);
          return true;
        }

        if (key.ctrl && key.name === 'k') {
          if (highlightedPid) {
            dismissBackgroundShell(highlightedPid);
            // If we killed the active one, the list might update via props
          }
          return true;
        }

        if (keyMatchers[Command.TOGGLE_BACKGROUND_SHELL_LIST](key)) {
          if (highlightedPid) {
            setActiveBackgroundShellPid(highlightedPid);
          }
          setIsBackgroundShellListOpen(false);
          return true;
        }
        return false;
      }

      if (keyMatchers[Command.TOGGLE_BACKGROUND_SHELL](key)) {
        return true;
      }

      if (key.ctrl && key.name === 'k') {
        dismissBackgroundShell(activeShell.pid);
        return true;
      }

      if (keyMatchers[Command.TOGGLE_BACKGROUND_SHELL_LIST](key)) {
        setIsBackgroundShellListOpen(true);
        return true;
      }

      const checkAtBottom = () => {
        setTimeout(() => {
          if (outputRef.current) {
            const state = outputRef.current.getScrollState();
            const atBottom =
              state.scrollTop + state.innerHeight >= state.scrollHeight - 1;
            setIsAtBottom(atBottom);
          }
        }, 50);
      };

      if (
        keyMatchers[Command.SCROLL_UP](key) ||
        keyMatchers[Command.SCROLL_DOWN](key) ||
        keyMatchers[Command.PAGE_UP](key) ||
        keyMatchers[Command.PAGE_DOWN](key) ||
        keyMatchers[Command.SCROLL_HOME](key) ||
        keyMatchers[Command.SCROLL_END](key)
      ) {
        // Check if we are at the bottom after scrolling
        checkAtBottom();
        return true;
      }

      if (key.name === 'return') {
        ShellExecutionService.writeToPty(activeShell.pid, '\r');
        return true;
      } else if (key.name === 'backspace') {
        ShellExecutionService.writeToPty(activeShell.pid, '\b');
        return true;
      } else if (key.sequence) {
        ShellExecutionService.writeToPty(activeShell.pid, key.sequence);
        return true;
      }
      return false;
    },
    { isActive: isFocused && !!activeShell },
  );

  const renderTabs = () => {
    const shellList = Array.from(shells.values()).filter(
      (s) => s.status === 'running',
    );

    const pidInfoWidth = ` (PID: ${activePid}) ${isFocused ? '(Focused)' : ''}`
      .length;

    const availableWidth =
      width - TAB_DISPLAY_HORIZONTAL_PADDING - RIGHT_TEXT.length - pidInfoWidth;

    let currentWidth = 0;
    const tabs = [];
    let overflow = false;

    for (let i = 0; i < shellList.length; i++) {
      const shell = shellList[i];
      const maxTabLabelLength = Math.max(
        1,
        Math.floor(availableWidth / shellList.length) - TAB_PADDING,
      );
      const truncatedCommand = formatShellCommandForDisplay(
        shell.command,
        maxTabLabelLength,
      );
      const label = ` ${i + 1}: ${truncatedCommand} `;
      const labelWidth = label.length;

      if (currentWidth + labelWidth > availableWidth) {
        overflow = true;
        break;
      }

      const isActive = shell.pid === activePid;

      tabs.push(
        <Text
          key={shell.pid}
          color={isActive ? theme.text.primary : theme.text.secondary}
          bold={isActive}
        >
          {label}
        </Text>,
      );
      currentWidth += labelWidth;
    }

    if (overflow) {
      tabs.push(
        <Text key="overflow" color={theme.status.warning} bold>
          {' ... (Ctrl+L) '}
        </Text>,
      );
    }

    return tabs;
  };

  const renderProcessList = () => {
    const headerText = 'Select Process (Enter to select, Esc to cancel):';
    const maxCommandLength = Math.max(
      0,
      width - BORDER_WIDTH - CONTENT_PADDING_X * 2 - 10,
    );

    const items: Array<RadioSelectItem<number>> = Array.from(
      shells.values(),
    ).map((shell, index) => {
      const truncatedCommand = formatShellCommandForDisplay(
        shell.command,
        maxCommandLength,
      );

      let label = `${index + 1}: ${truncatedCommand} (PID: ${shell.pid})`;
      if (shell.status === 'exited') {
        label += ` (Exit Code: ${shell.exitCode})`;
      }

      return {
        key: shell.pid.toString(),
        value: shell.pid,
        label,
      };
    });

    const initialIndex = items.findIndex((item) => item.value === activePid);

    return (
      <Box flexDirection="column" height="100%" width="100%">
        <Box flexShrink={0} marginBottom={1} paddingTop={1}>
          <Text bold>{headerText}</Text>
        </Box>
        <Box flexGrow={1} width="100%">
          <RadioButtonSelect
            items={items}
            initialIndex={initialIndex >= 0 ? initialIndex : 0}
            onSelect={(pid) => {
              setActiveBackgroundShellPid(pid);
              setIsBackgroundShellListOpen(false);
            }}
            onHighlight={(pid) => setHighlightedPid(pid)}
            isFocused={isFocused}
            maxItemsToShow={Math.max(1, height - HEADER_HEIGHT - 3)} // Adjust for header
            renderItem={(
              item,
              { isSelected: _isSelected, titleColor: _titleColor },
            ) => {
              // Custom render to handle exit code coloring if needed,
              // or just use default. The default RadioButtonSelect renderer
              // handles standard label.
              // But we want to color exit code differently?
              // The previous implementation colored exit code green/red.
              // Let's reimplement that.

              // We need access to shell details here.
              // We can put shell details in the item or lookup.
              // Lookup from shells map.
              const shell = shells.get(item.value);
              if (!shell) return <Text>{item.label}</Text>;

              const truncatedCommand = formatShellCommandForDisplay(
                shell.command,
                maxCommandLength,
              );

              return (
                <Text>
                  {truncatedCommand} (PID: {shell.pid})
                  {shell.status === 'exited' ? (
                    <Text
                      color={
                        shell.exitCode === 0
                          ? theme.status.success
                          : theme.status.error
                      }
                    >
                      {' '}
                      (Exit Code: {shell.exitCode})
                    </Text>
                  ) : null}
                </Text>
              );
            }}
          />
        </Box>
      </Box>
    );
  };

  const renderOutput = () => {
    const lines = typeof output === 'string' ? output.split('\n') : output;

    return (
      <ScrollableList
        ref={outputRef}
        data={lines}
        renderItem={({ item: line, index }) => {
          if (typeof line === 'string') {
            return <Text key={index}>{line}</Text>;
          }
          return (
            <Text key={index} wrap="truncate">
              {line.length > 0
                ? line.map((token: AnsiToken, tokenIndex: number) => (
                    <Text
                      key={tokenIndex}
                      color={token.fg}
                      backgroundColor={token.bg}
                      inverse={token.inverse}
                      dimColor={token.dim}
                      bold={token.bold}
                      italic={token.italic}
                      underline={token.underline}
                    >
                      {token.text}
                    </Text>
                  ))
                : null}
            </Text>
          );
        }}
        estimatedItemHeight={() => 1}
        keyExtractor={(_, index) => index.toString()}
        hasFocus={isFocused}
      />
    );
  };

  return (
    <Box
      flexDirection="column"
      height="100%"
      width="100%"
      borderStyle="single"
      borderColor={isFocused ? theme.border.focused : undefined}
    >
      <Box
        flexDirection="row"
        justifyContent="space-between"
        borderStyle="single"
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderTop={false}
        paddingX={1}
        borderColor={isFocused ? theme.border.focused : undefined}
      >
        <Box flexDirection="row">
          {renderTabs()}
          <Text bold>
            {' '}
            (PID: {activeShell?.pid}) {isFocused ? '(Focused)' : ''}
          </Text>
        </Box>
        <Text color={theme.text.accent}>{RIGHT_TEXT} | Ctrl+L List</Text>
      </Box>
      <Box flexGrow={1} overflow="hidden" paddingX={CONTENT_PADDING_X}>
        {isListOpenProp ? renderProcessList() : renderOutput()}
      </Box>
    </Box>
  );
};
