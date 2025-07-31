/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type File, type IdeContext } from '@google/gemini-cli-core';
import { Box, Text } from 'ink';
import path from 'node:path';
import { Colors } from '../colors.js';

interface IDEContextDetailDisplayProps {
  ideContext: IdeContext | undefined;
  detectedIdeDisplay: string | undefined;
}

export function IDEContextDetailDisplay({
  ideContext,
  detectedIdeDisplay,
}: IDEContextDetailDisplayProps) {
  const openFiles = ideContext?.workspaceState?.openFiles;
  if (!openFiles || openFiles.length === 0) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={Colors.AccentCyan}
      paddingX={1}
    >
      <Text color={Colors.AccentCyan} bold>
        {detectedIdeDisplay ? detectedIdeDisplay : 'IDE'} Context (ctrl+e to
        toggle)
      </Text>
      {openFiles.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Open files:</Text>
          {openFiles.map((file: File) => (
            <Text key={file.path}>
              - {path.basename(file.path)}
              {file.isActive ? ' (active)' : ''}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
