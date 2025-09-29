/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { type ToolDefinition } from '../../types.js';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';

interface ToolsListProps {
  tools: readonly ToolDefinition[];
  showDescriptions: boolean;
  terminalWidth: number;
}

export const ToolsList: React.FC<ToolsListProps> = ({
  tools,
  showDescriptions,
  terminalWidth,
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
            {showDescriptions && tool.description && (
              <MarkdownDisplay
                terminalWidth={terminalWidth}
                text={tool.description}
                isPending={false}
              />
            )}
          </Box>
        </Box>
      ))
    ) : (
      <Text color={theme.text.primary}> No tools available</Text>
    )}
  </Box>
);
