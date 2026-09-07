/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import readline from 'node:readline';

export interface InputPromptProps {
  onSubmit: (value: string) => void;
  onExit: () => void;
  isDisabled?: boolean;
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
}: RawInputHandlerProps): null {
  useInput(
    (input, key) => {
      // Handle Ctrl+C
      if (key.ctrl && input === 'c') {
        if (text.length > 0) {
          setText('');
          setCursorPos(0);
          setHistoryIndex(-1);
        } else {
          onExit();
        }
        return;
      }

      if (isDisabled) return;

      // Handle Enter
      if (key.return) {
        const trimmed = text.trim();
        if (trimmed) {
          setHistory((prev) => [...prev, trimmed]);
          onSubmit(trimmed);
        }
        setText('');
        setCursorPos(0);
        setHistoryIndex(-1);
        setDraftText('');
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

      // Handle Up Arrow (History Backwards)
      if (key.upArrow) {
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

      // Handle Down Arrow (History Forwards)
      if (key.downArrow) {
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
        if (cursorPos > 0) {
          const newText = text.slice(0, cursorPos - 1) + text.slice(cursorPos);
          setText(newText);
          setCursorPos((prev) => prev - 1);
        }
        return;
      }

      // Ignore other control keys or escape sequences
      if (key.escape || key.tab || key.pageDown || key.pageUp || key.meta || key.ctrl) {
        return;
      }

      // Append printable character
      if (input) {
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
}: InputPromptProps): React.JSX.Element {
  const { isRawModeSupported } = useStdin();
  const [text, setText] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draftText, setDraftText] = useState('');

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
        />
      ) : (
        <PipedInputHandler onSubmit={onSubmit} onExit={onExit} />
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
