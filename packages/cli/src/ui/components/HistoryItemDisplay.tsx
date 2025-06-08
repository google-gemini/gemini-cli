/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { HistoryItem } from '../types.js';
import { UserMessage } from './messages/UserMessage.js';
import { UserShellMessage } from './messages/UserShellMessage.js';
import { GeminiMessage } from './messages/GeminiMessage.js';
import { InfoMessage } from './messages/InfoMessage.js';
import { ErrorMessage } from './messages/ErrorMessage.js';
import { ToolGroupMessage } from './messages/ToolGroupMessage.js';
import { GeminiMessageContent } from './messages/GeminiMessageContent.js';
import { Box } from 'ink';
import { AboutBox } from './AboutBox.js';
import { Config } from '@gemini-cli/core';

interface HistoryItemDisplayProps {
  item: HistoryItem;
  availableTerminalHeight: number;
  isPending: boolean;
  config?: Config;
}

export const HistoryItemDisplay: React.FC<HistoryItemDisplayProps> = ({
  item,
  availableTerminalHeight,
  isPending,
  config,
}) => (
  <Box flexDirection="column" key={item.id}>
    {/* Render standard message types */}
    {item.type === 'user' && <UserMessage text={item.text} />}
    {item.type === 'user_shell' && <UserShellMessage text={item.text} />}
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
    {item.type === 'about' && (
      <AboutBox
        cliVersion={item.cliVersion}
        osVersion={item.osVersion}
        sandboxEnv={item.sandboxEnv}
        modelVersion={item.modelVersion}
      />
    )}
    {item.type === 'tool_group' && (
      <ToolGroupMessage
        toolCalls={item.tools}
        groupId={item.id}
        availableTerminalHeight={availableTerminalHeight}
        config={config}
      />
    )}
  </Box>
);
