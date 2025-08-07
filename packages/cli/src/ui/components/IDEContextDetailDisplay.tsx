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

  const basenameCounts = new Map<string, number>();
  for (const file of openFiles) {
    const basename = path.basename(file.path);
    basenameCounts.set(basename, (basenameCounts.get(basename) || 0) + 1);
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
          {openFiles.map((file: File) => {
            const basename = path.basename(file.path);
            const isDuplicate = (basenameCounts.get(basename) || 0) > 1;
            const parentDir = path.basename(path.dirname(file.path));
            const displayName = isDuplicate
              ? `${basename} (/${parentDir})`
              : basename;

            return (
              <Text key={file.path}>
                - {displayName}
                {file.isActive ? ' (active)' : ''}
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
