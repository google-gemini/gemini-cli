/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';
import { useUIActions } from '../contexts/UIActionsContext.js';
import {
  ShellExecutionService,
  type AnsiOutput,
} from '@google/gemini-cli-core';
import { type BackgroundShell } from '../hooks/shellCommandProcessor.js';
import { AnsiOutputText } from './AnsiOutput.js';
import { Command, keyMatchers } from '../keyMatchers.js';
import { useKeypress } from '../hooks/useKeypress.js';

interface BackgroundShellDisplayProps {
  shells: Map<number, BackgroundShell>;
  activePid: number;
  width: number;
  height: number;
  isFocused: boolean;
  isListOpenProp: boolean;
}

const CONTENT_PADDING_X = 1;
const RIGHT_TEXT = 'F11 Hide | Ctrl+K Kill';
// 2 for borders, 2 for padding
const TAB_DISPLAY_HORIZONTAL_PADDING = 4;

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
  } = useUIActions();
  const activeShell = shells.get(activePid);
  const [output, setOutput] = useState<string | AnsiOutput>('');
  // Track internal selection for the list view
  const [listSelectionIndex, setListSelectionIndex] = useState(0);

  useEffect(() => {
    if (!shells.has(activePid)) return;
    // Resize the active PTY
    // 2 for borders, plus padding on both sides
    const ptyWidth = Math.max(
      1,
      width - TAB_DISPLAY_HORIZONTAL_PADDING / 2 - CONTENT_PADDING_X * 2,
    );
    const ptyHeight = Math.max(1, height - 3); // -2 for border, -1 for header
    ShellExecutionService.resizePty(activePid, ptyWidth, ptyHeight);
  }, [activePid, width, height, shells]);

  useEffect(() => {
    if (activeShell) {
      setOutput(activeShell.output);
    }
  }, [activeShell]);

  // Sync list selection with active PID when opening list
  useEffect(() => {
    if (isListOpenProp && activeShell) {
      const shellPids = Array.from(shells.keys());
      const index = shellPids.indexOf(activeShell.pid);
      if (index !== -1) {
        setListSelectionIndex(index);
      }
    }
  }, [isListOpenProp, activeShell, shells]);

  // Auto-open list if multiple shells exist on mount, or auto-focus single shell
  useEffect(() => {
    if (shells.size === 1) {
      setIsBackgroundShellListOpen(false);
    } else if (shells.size > 1) {
      setIsBackgroundShellListOpen(true);
    }
    // We only want this to run on mount (when the component becomes visible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useKeypress(
    (key) => {
      if (!activeShell) return;

      if (isListOpenProp) {
        const shellPids = Array.from(shells.keys());

        if (key.name === 'up') {
          setListSelectionIndex(
            (prev) => (prev - 1 + shellPids.length) % shellPids.length,
          );
          return;
        }
        if (key.name === 'down') {
          setListSelectionIndex((prev) => (prev + 1) % shellPids.length);
          return;
        }
        if (key.name === 'return' || key.name === 'enter') {
          const selectedPid = shellPids[listSelectionIndex];
          if (selectedPid) {
            setActiveBackgroundShellPid(selectedPid);
          }
          setIsBackgroundShellListOpen(false);
          return;
        }
        if (key.name === 'escape') {
          setIsBackgroundShellListOpen(false);
          return;
        }
        // Handle Ctrl+O to select current and close list (toggle behavior)
        if (key.ctrl && key.name === 'o') {
          const selectedPid = shellPids[listSelectionIndex];
          if (selectedPid) {
            setActiveBackgroundShellPid(selectedPid);
          }
          setIsBackgroundShellListOpen(false);
          return;
        }
        // Don't let other keys bleed through when list is open
        return;
      }

      if (keyMatchers[Command.TOGGLE_BACKGROUND_SHELL](key)) {
        return;
      }

      // Ctrl+K to dismiss
      if (key.ctrl && key.name === 'k') {
        dismissBackgroundShell(activeShell.pid);
        return;
      }

      // If we want to toggle list via keyboard - this is redundant with global shortcut but good for focused context
      if (key.ctrl && key.name === 'o') {
        setIsBackgroundShellListOpen(true);
        return;
      }

      // Forward input to PTY
      if (key.name === 'return') {
        ShellExecutionService.writeToPty(activeShell.pid, '\r');
      } else if (key.name === 'backspace') {
        ShellExecutionService.writeToPty(activeShell.pid, '\b');
      } else if (key.sequence) {
        ShellExecutionService.writeToPty(activeShell.pid, key.sequence);
      }
    },
    { isActive: isFocused && !!activeShell },
  );

  const renderTabs = () => {
    const tabs = [];
    const shellList = Array.from(shells.values());

    // Calculate available width for tabs
    // width - borders(2) - padding(2) - rightText - pidText - spacing
    // PID text approx: " (PID: 123456) (Focused)" -> ~25 chars
    const pidTextEstimate = 25;
    const availableWidth =
      width -
      TAB_DISPLAY_HORIZONTAL_PADDING -
      RIGHT_TEXT.length -
      pidTextEstimate;

    let currentWidth = 0;
    let overflow = false;

    for (let i = 0; i < shellList.length; i++) {
      const shell = shellList[i];
      const label = ` ${i + 1}: ${shell.command.split(' ')[0]} `;
      const labelWidth = label.length;

      if (currentWidth + labelWidth > availableWidth) {
        overflow = true;
        break;
      }

      const isActive = shell.pid === activePid;
      const isExited = shell.status === 'exited';
      tabs.push(
        <Text
          key={shell.pid}
          color={isActive ? 'white' : isExited ? 'red' : 'gray'}
          backgroundColor={isActive ? (isExited ? 'red' : 'blue') : undefined}
          bold={isActive}
        >
          {label}
          {isExited ? '(Exited)' : ''}
        </Text>,
      );
      currentWidth += labelWidth;
    }

    if (overflow) {
      tabs.push(
        <Text key="overflow" color="yellow" bold>
          {' ... (Ctrl+O) '}
        </Text>,
      );
    }

    return tabs;
  };

  const renderProcessList = () => {
    const shellList = Array.from(shells.values());
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold underline>
          Select Process (Enter to select, Esc to cancel):
        </Text>
        {shellList.map((shell, index) => {
          const isSelected = index === listSelectionIndex;
          const statusText =
            shell.status === 'exited' ? ` (Exited: ${shell.exitCode})` : '';
          return (
            <Text
              key={shell.pid}
              color={isSelected ? 'black' : 'white'}
              backgroundColor={isSelected ? 'green' : undefined}
            >
              {isSelected ? '> ' : '  '} {index + 1}: {shell.command} (PID:{' '}
              {shell.pid}){statusText}
            </Text>
          );
        })}
      </Box>
    );
  };

  return (
    <Box
      flexDirection="column"
      height="100%"
      width="100%"
      borderStyle="single"
      borderColor={isFocused ? 'blue' : undefined}
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
        borderColor={isFocused ? 'blue' : undefined}
      >
        <Box flexDirection="row">
          {renderTabs()}
          <Text bold>
            {' '}
            (PID: {activeShell?.pid}) {isFocused ? '(Focused)' : ''}
          </Text>
        </Box>
        <Text color="gray">{RIGHT_TEXT} | Ctrl+O List</Text>
      </Box>
      <Box flexGrow={1} overflow="hidden" paddingX={CONTENT_PADDING_X}>
        {isListOpenProp ? (
          renderProcessList()
        ) : typeof output === 'string' ? (
          <Text>{output}</Text>
        ) : (
          <AnsiOutputText
            data={output}
            width={Math.max(1, width - 2 - CONTENT_PADDING_X * 2)}
            availableTerminalHeight={Math.max(1, height - 3)}
          />
        )}
      </Box>
    </Box>
  );
};
