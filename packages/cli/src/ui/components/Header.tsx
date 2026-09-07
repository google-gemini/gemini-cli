/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ProjectInfo } from '@zoe/core';

export interface HeaderProps {
  project?: ProjectInfo;
}

export function Header({ project }: HeaderProps): React.JSX.Element {
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

      {project && (
        <Box flexDirection="column" marginTop={0}>
          <Text bold color="white">
            {project.displayPath}
          </Text>
          <Text color="cyan">
            {project.summary}
          </Text>
        </Box>
      )}
    </Box>
  );
}
