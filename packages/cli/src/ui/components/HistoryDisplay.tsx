/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box } from 'ink';
import type { HistoryItem } from '../types.js';
import { UserMessage } from './messages/UserMessage.js';
import { GeminiMessage } from './messages/GeminiMessage.js';
import { InfoMessage } from './messages/InfoMessage.js';
import { ErrorMessage } from './messages/ErrorMessage.js';
import { ToolGroupMessage } from './messages/ToolGroupMessage.js';
import { PartListUnion } from '@google/genai';

interface HistoryDisplayProps {
  history: HistoryItem[];
  onSubmit: (value: PartListUnion) => void;
}

export const HistoryDisplay: React.FC<HistoryDisplayProps> = ({
  history,
  onSubmit,
}) => (
  // No grouping logic needed here anymore
  <Box flexDirection="column">
    {history.map((item) => (
      <Box key={item.id} marginBottom={1}>
        {/* Render standard message types */}
        {item.type === 'user' && <UserMessage text={item.text} />}
        {item.type === 'gemini' && <GeminiMessage text={item.text} />}
        {item.type === 'info' && <InfoMessage text={item.text} />}
        {item.type === 'error' && <ErrorMessage text={item.text} />}

        {/* Render the tool group component */}
        {item.type === 'tool_group' && (
          <ToolGroupMessage toolCalls={item.tools} onSubmit={onSubmit} />
        )}
      </Box>
    ))}
  </Box>
);
