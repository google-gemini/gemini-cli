/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { HistoryItem } from '../types.js';
import { UserMessage } from './messages/UserMessage.js';
import { GeminiMessage } from './messages/GeminiMessage.js';
import { InfoMessage } from './messages/InfoMessage.js';
import { ErrorMessage } from './messages/ErrorMessage.js';
import { ToolGroupMessage } from './messages/ToolGroupMessage.js';
import { GeminiMessageContent } from './messages/GeminiMessageContent.js';
import { Box } from 'ink';

interface HistoryItemDisplayProps {
  item: HistoryItem;
  availableTerminalHeight: number;
  isPending: boolean;
}

export const HistoryItemDisplay: React.FC<HistoryItemDisplayProps> = ({
  item,
  availableTerminalHeight,
  isPending,
}) => (
  <Box flexDirection="column" key={item.id}>
    {/* Render standard message types */}
    {item.type === 'user' && <UserMessage text={item.text} />}
    {item.type === 'gemini' && (
      <GeminiMessage
        text={item.text}
        isPending={isPending}
        availableTerminalHeight={availableTerminalHeight}
      />
    )}
    {item.type === 'gemini_content' && (
      <GeminiMessageContent
        text={item.text}
        isPending={isPending}
        availableTerminalHeight={availableTerminalHeight}
      />
    )}
    {item.type === 'info' && <InfoMessage text={item.text} />}
    {item.type === 'error' && <ErrorMessage text={item.text} />}
    {item.type === 'tool_group' && (
      <ToolGroupMessage
        toolCalls={item.tools}
        groupId={item.id}
        availableTerminalHeight={availableTerminalHeight}
      />
    )}
  </Box>
);
