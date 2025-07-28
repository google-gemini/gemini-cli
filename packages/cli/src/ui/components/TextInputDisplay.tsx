/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { Colors } from '../colors.js';
import { cpSlice } from '../utils/textUtils.js';
import { useTextBuffer } from './shared/text-buffer.js';

type TextBuffer = ReturnType<typeof useTextBuffer>;

interface TextInputDisplayProps {
  buffer: TextBuffer;
  placeholder: string;
  focus: boolean;
}

const TextInputDisplayComponent: React.FC<TextInputDisplayProps> = ({
  buffer,
  placeholder,
  focus,
}) => {
  return (
    <Box flexGrow={1}>
      {buffer.text.length === 0 && placeholder ? (
        focus ? (
          <Text>
            {chalk.inverse(placeholder.slice(0, 1))}
            <Text color={Colors.Gray}>{placeholder.slice(1)}</Text>
          </Text>
        ) : (
          <Text color={Colors.Gray}>{placeholder}</Text>
        )
      ) : (
        <Box flexDirection="column">
          {buffer.lines.map((line: string, i: number) => {
            if (i !== buffer.cursor[0]) {
              return <Text key={i}>{line || ' '}</Text>;
            }

            const col = buffer.cursor[1];
            const before = cpSlice(line, 0, col);
            const at = cpSlice(line, col, col + 1) || ' ';
            const after = cpSlice(line, col + 1);

            return (
              <Text key={i}>
                {before}
                {chalk.inverse(at)}
                {after}
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export const TextInputDisplay = React.memo(TextInputDisplayComponent);
