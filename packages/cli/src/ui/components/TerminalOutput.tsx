/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';

interface TerminalOutputProps {
  output: string;
  cursor: { x: number; y: number } | null;
}

export const TerminalOutput: React.FC<TerminalOutputProps> = ({
  output,
  cursor,
}) => {
  const lines = output.split('\n');

  return (
    <Box flexDirection="column">
      {lines.map((line, index) => {
        if (cursor && index === cursor.y) {
          const before = line.substring(0, cursor.x);
          const at = line[cursor.x] ?? ' ';
          const after = line.substring(cursor.x + 1);
          return (
            <Text key={index}>
              {before}
              <Text inverse>{at}</Text>
              {after}
            </Text>
          );
        }
        return <Text key={index}>{line}</Text>;
      })}
    </Box>
  );
};
