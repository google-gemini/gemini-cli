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
  provider?: string;
  model?: string;
}

export function Header({ project, provider, model }: HeaderProps): React.JSX.Element {
  const modelPill = provider && model ? `[${provider}:${model}]` : (model ? `[${model}]` : '');

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <Text bold color="cyan">◈ ZOE</Text>
        {modelPill ? (
          <Text color="yellow"> {modelPill}</Text>
        ) : null}
        {project?.displayPath ? (
          <Text color="gray">  {project.displayPath}</Text>
        ) : null}
        {project?.badges && project.badges.length > 0 ? (
          <Text color="blue">  ({project.badges.join(' • ')})</Text>
        ) : null}
      </Box>
      <Box>
        <Text color="gray">{'─'.repeat(72)}</Text>
      </Box>
    </Box>
  );
}
