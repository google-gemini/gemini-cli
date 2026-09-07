/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface ThoughtBoxProps {
  thought?: string;
  isStreaming?: boolean;
}

export function ThoughtBox({ thought, isStreaming }: ThoughtBoxProps): React.JSX.Element | null {
  const trimmed = thought?.trim();
  if (!trimmed) return null;

  return (
    <Box flexDirection="column" marginY={0} paddingLeft={1}>
      <Text>
        <Text color="gray" dimColor>◈ </Text>
        <Text color="cyan" dimColor>Thought Process</Text>
        {isStreaming ? <Text color="yellow" dimColor> (reasoning...)</Text> : null}
      </Text>
      <Box paddingLeft={2}>
        <Text color="gray" dimColor italic>
          {trimmed}
        </Text>
      </Box>
    </Box>
  );
}
