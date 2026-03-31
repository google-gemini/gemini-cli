/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';

type AgentId = 'builder' | 'skeptic' | 'explorer' | 'moderator';

interface DiscussThinkingMessageProps {
  agent: AgentId;
}

export const DiscussThinkingMessage: React.FC<DiscussThinkingMessageProps> = ({
  agent,
}) => (
    <Box>
      <Text color={theme.text.secondary}>[{agent}] thinking...</Text>
    </Box>
  );
