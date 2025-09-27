/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { type ToolDefinition } from '../../types.js';

interface ToolsListProps {
  tools: readonly ToolDefinition[];
  showDescriptions: boolean;
}

export const ToolsList: React.FC<ToolsListProps> = ({
  tools,
  showDescriptions,
}) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text bold color={theme.text.primary}>
      Available Gemini CLI tools:
    </Text>
    <Box height={1} />
    {tools.length > 0 ? (
      tools.map((tool) => (
        <Box key={tool.name} flexDirection="row">
          <Text color={theme.text.primary}>{'  '}- </Text>
          <Box flexDirection="column">
            <Text bold color={theme.text.accent}>
              {tool.displayName}
              {showDescriptions ? ` (${tool.name})` : ''}
            </Text>
            {showDescriptions &&
              tool.description &&
              tool.description
                .trim()
                .split('\n')
                .map((line, index) => (
                  <Text key={index} color={theme.text.secondary}>
                    {'      '}
                    {line}
                  </Text>
                ))}
          </Box>
        </Box>
      ))
    ) : (
      <Text color={theme.text.primary}> No tools available</Text>
    )}
  </Box>
);
