/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { type OpenFiles } from '@google/gemini-cli-core';
import { Colors } from '../colors.js';
import path from 'node:path';

interface IDEContextDetailDisplayProps {
  openFiles: OpenFiles | undefined;
}

export function IDEContextDetailDisplay({
  openFiles,
}: IDEContextDetailDisplayProps) {
  if (
    !openFiles ||
    !openFiles.recentOpenFiles ||
    openFiles.recentOpenFiles.length === 0
  ) {
    return null;
  }
  const recentFiles = openFiles.recentOpenFiles || [];

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={Colors.AccentCyan}
      paddingX={1}
    >
      <Text color={Colors.AccentCyan} bold>
        IDE Context (ctrl+e to toggle)
      </Text>
      {recentFiles.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Recent files:</Text>
          {recentFiles.map((file) => (
            <Text key={file.filePath}>
              - {path.basename(file.filePath)}
              {file.filePath === openFiles.activeFile ? ' (active)' : ''}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
