/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import readline from 'node:readline';
import type { CommandItem } from '../../commands/CommandRegistry.js';
import { CommandPalette } from '../components/CommandPalette.js';

export interface InputPromptProps {
  onSubmit: (value: string) => void;
  onExit: () => void;
  isDisabled?: boolean;
  commands?: CommandItem[];
}

interface RawInputHandlerProps {
  onSubmit: (value: string) => void;
  onExit: () => void;
  isDisabled: boolean;
  text: string;
  setText: React.Dispatch<React.SetStateAction<string>>;
  cursorPos: number;
  setCursorPos: React.Dispatch<React.SetStateAction<number>>;
  history: string[];
  setHistory: React.Dispatch<React.SetStateAction<string[]>>;
  historyIndex: number;
  setHistoryIndex: React.Dispatch<React.SetStateAction<number>>;
  draftText: string;
  setDraftText: React.Dispatch<React.SetStateAction<string>>;
  isCommandMode: boolean;
  matches: CommandItem[];
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  isDismissed: boolean;
  setIsDismissed: React.Dispatch<React.SetStateAction<boolean>>;
}

function RawInputHandler({
  onSubmit,
  onExit,
  isDisabled,
  text,
  setText,
  cursorPos,
  setCursorPos,
  history,
  setHistory,
  historyIndex,
  setHistoryIndex,
  draftText,
  setDraftText,
  isCommandMode,
  matches,
  selectedIndex,
  setSelectedIndex,
  isDismissed,
  setIsDismissed,
}: RawInputHandlerProps): null {
  useInput(
    (input, key) => {
      // Handle Ctrl+C
      if (key.ctrl && input === 'c') {
        if (text.length > 0) {
          setText('');
          setCursorPos(0);
          setHistoryIndex(-1);
          setIsDismissed(false);
        } else {
          onExit();
        }
        return;
      }

      if (isDisabled) return;

      // Handle Escape (dismiss suggestion palette)
      if (key.escape) {
        if (isCommandMode && !isDismissed) {
          setIsDismissed(true);
        }
        return;
      }

      // Handle Tab (autocomplete selected suggestion)
      if (key.tab) {
        if (isCommandMode && !isDismissed && matches.length > 0) {
          const selected = matches[selectedIndex] ?? matches[0];
          if (selected) {
            const completed = `/${selected.name} `;
            setText(completed);
            setCursorPos(completed.length);
          }
        }
        return;
      }

      // Handle Enter
      if (key.return) {
        if (text.trim() === '/' && isCommandMode && !isDismissed && matches.length > 0) {
          const selected = matches[selectedIndex] ?? matches[0];
          if (selected) {
            const completed = `/${selected.name} `;
            setText(completed);
            setCursorPos(completed.length);
            return;
          }
        }

        const trimmed = text.trim();
        if (trimmed) {
          setHistory((prev) => [...prev, trimmed]);
          onSubmit(trimmed);
        }
        setText('');
        setCursorPos(0);
        setHistoryIndex(-1);
        setDraftText('');
        setIsDismissed(false);
        return;
      }

      // Handle Left Arrow
      if (key.leftArrow) {
        setCursorPos((prev) => Math.max(0, prev - 1));
        return;
      }

      // Handle Right Arrow
      if (key.rightArrow) {
        setCursorPos((prev) => Math.min(text.length, prev + 1));
        return;
      }

      // Handle Up Arrow (Palette navigation or History backwards)
      if (key.upArrow) {
        if (isCommandMode && !isDismissed && matches.length > 0) {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : matches.length - 1));
          return;
        }

        if (history.length === 0) return;
        if (historyIndex === -1) {
          setDraftText(text);
          const newIdx = history.length - 1;
          setHistoryIndex(newIdx);
          setText(history[newIdx]);
          setCursorPos(history[newIdx].length);
        } else if (historyIndex > 0) {
          const newIdx = historyIndex - 1;
          setHistoryIndex(newIdx);
          setText(history[newIdx]);
          setCursorPos(history[newIdx].length);
        }
        return;
      }

      // Handle Down Arrow (Palette navigation or History forwards)
      if (key.downArrow) {
        if (isCommandMode && !isDismissed && matches.length > 0) {
          setSelectedIndex((prev) => (prev < matches.length - 1 ? prev + 1 : 0));
          return;
        }

        if (historyIndex === -1) return;
        if (historyIndex < history.length - 1) {
          const newIdx = historyIndex + 1;
          setHistoryIndex(newIdx);
          setText(history[newIdx]);
          setCursorPos(history[newIdx].length);
        } else {
          setHistoryIndex(-1);
          setText(draftText);
          setCursorPos(draftText.length);
        }
        return;
      }

      // Handle Backspace
      if (key.backspace || key.delete) {
        setIsDismissed(false);
        if (cursorPos > 0) {
          const newText = text.slice(0, cursorPos - 1) + text.slice(cursorPos);
          setText(newText);
          setCursorPos((prev) => prev - 1);
        }
        return;
      }

      // Ignore other control keys or escape sequences
      if (key.pageDown || key.pageUp || key.meta || key.ctrl) {
        return;
      }

      // Append printable character
      if (input) {
        setIsDismissed(false);
        const newText = text.slice(0, cursorPos) + input + text.slice(cursorPos);
        setText(newText);
        setCursorPos((prev) => prev + input.length);
      }
    },
    { isActive: !isDisabled }
  );

  return null;
}

function PipedInputHandler({
  onSubmit,
  onExit,
}: {
  onSubmit: (value: string) => void;
  onExit: () => void;
}): null {
  useEffect(() => {
    const rl = readline.createInterface({
      input: process.stdin,
      terminal: false,
    });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (trimmed) {
        onSubmit(trimmed);
      }
    });

    rl.on('close', () => {
      onExit();
    });

    return () => {
      rl.close();
    };
  }, [onSubmit, onExit]);

  return null;
}

export function InputPrompt({
  onSubmit,
  onExit,
  isDisabled = false,
  commands,
}: InputPromptProps): React.JSX.Element {
  const { isRawModeSupported } = useStdin();
  const [text, setText] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draftText, setDraftText] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);

  const isCommandMode = text.startsWith('/') && !text.includes(' ');
  const query = isCommandMode ? text.slice(1).toLowerCase() : '';

  const matches = useMemo(() => {
    if (!isCommandMode || !commands || commands.length === 0) {
      return [];
    }
    return commands
      .filter((cmd) => cmd.name.toLowerCase().includes(query))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(query);
        const bStarts = b.name.toLowerCase().startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [isCommandMode, query, commands]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const beforeCursor = text.slice(0, cursorPos);
  const cursorChar = text[cursorPos] || ' ';
  const afterCursor = text.slice(cursorPos + 1);

  return (
    <Box flexDirection="column">
      {isRawModeSupported ? (
        <RawInputHandler
          onSubmit={onSubmit}
          onExit={onExit}
          isDisabled={isDisabled}
          text={text}
          setText={setText}
          cursorPos={cursorPos}
          setCursorPos={setCursorPos}
          history={history}
          setHistory={setHistory}
          historyIndex={historyIndex}
          setHistoryIndex={setHistoryIndex}
          draftText={draftText}
          setDraftText={setDraftText}
          isCommandMode={isCommandMode}
          matches={matches}
          selectedIndex={selectedIndex}
          setSelectedIndex={setSelectedIndex}
          isDismissed={isDismissed}
          setIsDismissed={setIsDismissed}
        />
      ) : (
        <PipedInputHandler onSubmit={onSubmit} onExit={onExit} />
      )}
      {isCommandMode && !isDismissed && (
        <CommandPalette
          matches={matches}
          selectedIndex={selectedIndex}
          query={query}
        />
      )}
      <Box flexDirection="row">
        <Text color="cyan">zoe &gt; </Text>
        <Text color="white">{beforeCursor}</Text>
        <Text inverse color="white">
          {cursorChar}
        </Text>
        <Text color="white">{afterCursor}</Text>
      </Box>
    </Box>
  );
}
