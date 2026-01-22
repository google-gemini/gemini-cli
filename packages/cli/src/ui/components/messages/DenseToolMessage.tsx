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

interface DenseToolMessageProps extends IndividualToolCallDisplay {
  isFirst: boolean;
}

interface FileDiffResult {
  fileDiff: string;
  fileName: string;
}

export const DenseToolMessage: React.FC<DenseToolMessageProps> = ({
  name,
  description,
  status,
  resultDisplay,
}) => {
  let denseResult: string | undefined;

  if (status === ToolCallStatus.Success && resultDisplay) {
    if (typeof resultDisplay === 'string') {
      const flattened = resultDisplay.replace(/\n/g, ' ').trim();
      denseResult =
        flattened.length > 50 ? flattened.slice(0, 47) + '...' : flattened;
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
        flattened.length > 50 ? flattened.slice(0, 47) + '...' : flattened;
    } else {
      denseResult = 'Failed';
    }
  }

  return (
    <Box marginLeft={2} flexDirection="row">
      <ToolStatusIndicator status={status} name={name} />
      <Box marginLeft={1}>
        <Text color={theme.text.primary} bold>
          {name}
        </Text>
      </Box>
      <Box marginLeft={1}>
        <Text color={theme.text.secondary}>{description}</Text>
      </Box>
      {denseResult && (
        <Box marginLeft={1}>
          <Text color={theme.text.accent}>→ {denseResult}</Text>
        </Box>
      )}
    </Box>
  );
};
