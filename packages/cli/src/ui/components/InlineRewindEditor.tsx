/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useKeypress } from '../hooks/useKeypress.js';
import { Colors } from '../colors.js';
import { useTextBuffer } from './shared/text-buffer.js';

interface InlineRewindEditorProps {
  initialText: string;
  width: number;
  onSave: (newText: string) => void;
  onCancel: () => void;
}

export const InlineRewindEditor: React.FC<InlineRewindEditorProps> = ({
  initialText,
  width,
  onSave,
  onCancel,
}) => {
  const buffer = useTextBuffer({
    initialText,
    viewport: { width: width - 4, height: 10 },
    isValidPath: () => false,
  });

  useKeypress(
    (key) => {
      // Save on Ctrl+S or Enter (if you prefer single line, but this handles multiline)
      if (key.ctrl && key.name === 's') {
        onSave(buffer.text);
        return;
      }

      // Cancel on Escape
      if (key.name === 'escape') {
        onCancel();
        return;
      }

      // Pass everything else to the text buffer logic
      buffer.handleInput(key);
    },
    { isActive: true },
  );

  // Helper to render lines with the cursor
  const renderLine = (line: string, lineIndex: number) => {
    const isCursorRow = buffer.cursor[0] === lineIndex;

    if (!isCursorRow) {
      return <Text key={lineIndex}>{line}</Text>;
    }

    const col = buffer.cursor[1];
    const before = line.slice(0, col);
    const cursorChar = line.slice(col, col + 1) || ' '; // Space if at end of line
    const after = line.slice(col + 1);

    return (
      <Text key={lineIndex}>
        {before}
        <Text backgroundColor={Colors.AccentYellow} color="black">
          {cursorChar}
        </Text>
        {after}
      </Text>
    );
  };

  return (
    <Box flexDirection="column" width={width}>
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={Colors.AccentYellow}
      >
        {buffer.lines.map((line, idx) => (
          <Box key={idx}>{renderLine(line, idx)}</Box>
        ))}
      </Box>
      <Text color="gray" dimColor>
        [Ctrl+S] Save [Esc] Cancel
      </Text>
    </Box>
  );
};
