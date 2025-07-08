/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '@icarus603/gemini-code-core';
import { Box } from 'ink';
import React from 'react';
import type { HistoryItem } from '../types.js';
import { AboutBox } from './AboutBox.js';
import { CompressionMessage } from './messages/CompressionMessage.js';
import { ErrorMessage } from './messages/ErrorMessage.js';
import { GeminiMessage } from './messages/GeminiMessage.js';
import { GeminiMessageContent } from './messages/GeminiMessageContent.js';
import { InfoMessage } from './messages/InfoMessage.js';
import { ToolGroupMessage } from './messages/ToolGroupMessage.js';
import { UserMessage } from './messages/UserMessage.js';
import { UserShellMessage } from './messages/UserShellMessage.js';
import { ModelStatsDisplay } from './ModelStatsDisplay.js';
import { SessionSummaryDisplay } from './SessionSummaryDisplay.js';
import { StatsDisplay } from './StatsDisplay.js';
import { ToolStatsDisplay } from './ToolStatsDisplay.js';

interface HistoryItemDisplayProps {
  item: HistoryItem;
  availableTerminalHeight?: number;
  terminalWidth: number;
  isPending: boolean;
  config?: Config;
  isFocused?: boolean;
}

export const HistoryItemDisplay: React.FC<HistoryItemDisplayProps> = ({
  item,
  availableTerminalHeight,
  terminalWidth,
  isPending,
  config,
  isFocused = true,
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
        terminalWidth={terminalWidth}
      />
    )}
    {item.type === 'gemini_content' && (
      <GeminiMessageContent
        text={item.text}
        isPending={isPending}
        availableTerminalHeight={availableTerminalHeight}
        terminalWidth={terminalWidth}
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
        selectedAuthType={item.selectedAuthType}
        gcpProject={item.gcpProject}
      />
    )}
    {item.type === 'stats' && <StatsDisplay duration={item.duration} />}
    {item.type === 'model_stats' && <ModelStatsDisplay />}
    {item.type === 'tool_stats' && <ToolStatsDisplay />}
    {item.type === 'quit' && <SessionSummaryDisplay duration={item.duration} />}
    {item.type === 'tool_group' && (
      <ToolGroupMessage
        toolCalls={item.tools}
        groupId={item.id}
        availableTerminalHeight={availableTerminalHeight}
        terminalWidth={terminalWidth}
        config={config}
        isFocused={isFocused}
      />
    )}
    {item.type === 'compression' && (
      <CompressionMessage compression={item.compression} />
    )}
  </Box>
);
