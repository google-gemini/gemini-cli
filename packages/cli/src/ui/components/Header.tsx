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
  const badges = project?.badges ? project.badges.filter((b) => b !== 'Git').slice(0, 3) : [];
  const badgeText = badges.length > 0 ? badges.join(' • ') : '';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        <Text bold color="cyan">◈ ZOE</Text>
        {modelPill ? <Text color="yellow">  {modelPill}</Text> : null}
      </Text>

      {project?.displayPath ? (
        <Text>
          <Text color="gray">{project.displayPath}</Text>
          {badgeText ? <Text color="blue">  ({badgeText})</Text> : null}
        </Text>
      ) : null}

      <Text color="gray">{'─'.repeat(60)}</Text>
    </Box>
  );
}
