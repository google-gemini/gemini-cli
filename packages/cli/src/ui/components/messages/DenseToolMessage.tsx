/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { ToolCallStatus } from '../../types.js';
import type { IndividualToolCallDisplay } from '../../types.js';
import { ToolStatusIndicator } from './ToolShared.js';
import { theme } from '../../semantic-colors.js';

type DenseToolMessageProps = IndividualToolCallDisplay;

interface FileDiffResult {
  fileDiff: string;
  fileName: string;
}

export const DenseToolMessage: React.FC<DenseToolMessageProps> = ({
  name,
  description,
  status,
  resultDisplay,
  outputFile,
}) => {
  let denseResult: string | undefined;

  if (status === ToolCallStatus.Success && resultDisplay) {
    if (typeof resultDisplay === 'string') {
      const flattened = resultDisplay.replace(/\n/g, ' ').trim();
      denseResult =
        flattened.length > 120 ? flattened.slice(0, 117) + '...' : flattened;
    } else if (typeof resultDisplay === 'object') {
      if ('fileDiff' in resultDisplay) {
        denseResult = `Diff applied to ${(resultDisplay as FileDiffResult).fileName}`;
      } else if ('todos' in resultDisplay) {
        denseResult = 'Todos updated';
      } else {
        // Fallback for AnsiOutput or other objects
        denseResult = 'Output received';
      }
    }
  } else if (status === ToolCallStatus.Error) {
    if (typeof resultDisplay === 'string') {
      const flattened = resultDisplay.replace(/\n/g, ' ').trim();
      denseResult =
        flattened.length > 120 ? flattened.slice(0, 117) + '...' : flattened;
    } else {
      denseResult = 'Failed';
    }
  }

  return (
    <Box flexDirection="column">
      <Box marginLeft={3} flexDirection="row" flexWrap="wrap">
        <ToolStatusIndicator status={status} name={name} />
        <Box maxWidth={25} flexShrink={1} flexGrow={0}>
          <Text color={theme.text.primary} bold wrap="truncate-end">
            {name}
          </Text>
        </Box>
        <Box marginLeft={1} flexShrink={1} flexGrow={0}>
          <Text color={theme.text.secondary} wrap="truncate-end">
            {description}
          </Text>
        </Box>
        {denseResult && (
          <Box marginLeft={1} flexGrow={1}>
            <Text color={theme.text.accent} wrap="wrap">
              → {denseResult}
            </Text>
          </Box>
        )}
      </Box>
      {outputFile && (
        <Box marginLeft={6}>
          <Text color={theme.text.secondary}>
            (Output saved to: {outputFile})
          </Text>
        </Box>
      )}
    </Box>
  );
};
