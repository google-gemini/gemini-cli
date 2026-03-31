/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { useUIState } from '../../contexts/UIStateContext.js';
import { theme } from '../../semantic-colors.js';

type AgentId = 'builder' | 'skeptic' | 'explorer' | 'moderator';

interface DiscussAgentMessageProps {
  agent: AgentId;
  text: string;
  terminalWidth: number;
  isPending: boolean;
  availableTerminalHeight?: number;
}

function colorForAgent(agent: AgentId): string {
  switch (agent) {
    case 'builder':
      return theme.status.success;
    case 'skeptic':
      return theme.status.warning;
    case 'explorer':
      return theme.text.accent;
    case 'moderator':
      return theme.text.primary;
    default:
      return theme.text.primary;
  }
}

export const DiscussAgentMessage: React.FC<DiscussAgentMessageProps> = ({
  agent,
  text,
  terminalWidth,
  isPending,
  availableTerminalHeight,
}) => {
  const { renderMarkdown } = useUIState();
  const label = `[${agent}] `;
  const labelWidth = label.length;

  return (
    <Box flexDirection="column">
      <Text color={colorForAgent(agent)}>{label}</Text>
      <Box marginLeft={labelWidth}>
        <MarkdownDisplay
          text={text}
          isPending={isPending}
          availableTerminalHeight={availableTerminalHeight}
          terminalWidth={Math.max(terminalWidth - labelWidth, 0)}
          renderMarkdown={renderMarkdown}
        />
      </Box>
    </Box>
  );
};
