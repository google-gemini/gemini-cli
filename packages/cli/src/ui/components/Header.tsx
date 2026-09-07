/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';

export function Header(): React.JSX.Element {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
        flexDirection="column"
        width={38}
      >
        <Text bold color="cyan">
          ZOE
        </Text>
        <Text color="gray">
          Engineering, not autocomplete.
        </Text>
      </Box>
    </Box>
  );
}
