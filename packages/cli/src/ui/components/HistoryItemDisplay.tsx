/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { escapeAnsiCtrlCodes } from '../utils/textUtils.js';
import type { HistoryItem } from '../types.js';
import { UserMessage } from './messages/UserMessage.js';
import { UserShellMessage } from './messages/UserShellMessage.js';
import { GeminiMessage } from './messages/GeminiMessage.js';
import { InfoMessage } from './messages/InfoMessage.js';
import { ErrorMessage } from './messages/ErrorMessage.js';
import { ToolGroupMessage } from './messages/ToolGroupMessage.js';
import { GeminiMessageContent } from './messages/GeminiMessageContent.js';
import { CompressionMessage } from './messages/CompressionMessage.js';
import { WarningMessage } from './messages/WarningMessage.js';
import { Box } from 'ink';
import { AboutBox } from './AboutBox.js';
import { StatsDisplay } from './StatsDisplay.js';
import { ModelStatsDisplay } from './ModelStatsDisplay.js';
import { ToolStatsDisplay } from './ToolStatsDisplay.js';
import { SessionSummaryDisplay } from './SessionSummaryDisplay.js';
import { Help } from './Help.js';
import type { SlashCommand } from '../commands/types.js';
import { ExtensionsList } from './views/ExtensionsList.js';
import { getMCPServerStatus } from '@google/gemini-cli-core';
import { ToolsList } from './views/ToolsList.js';
import { SkillsList } from './views/SkillsList.js';
import { AgentsStatus } from './views/AgentsStatus.js';
import { McpStatus } from './views/McpStatus.js';
import { ChatList } from './views/ChatList.js';
import { HooksList } from './views/HooksList.js';
import { ModelMessage } from './messages/ModelMessage.js';
import { ThinkingMessage } from './messages/ThinkingMessage.js';
import { HintMessage } from './messages/HintMessage.js';
import { getInlineThinkingMode } from '../utils/inlineThinkingMode.js';
import { useSettings } from '../contexts/SettingsContext.js';

interface HistoryItemDisplayProps {
  item: HistoryItem;
  availableTerminalHeight?: number;
  terminalWidth: number;
  isPending: boolean;
  commands?: readonly SlashCommand[];
  availableTerminalHeightGemini?: number;
  isExpandable?: boolean;
}

export const HistoryItemDisplay: React.FC<HistoryItemDisplayProps> = ({
  item,
  availableTerminalHeight,
  terminalWidth,
  isPending,
  commands,
  availableTerminalHeightGemini,
  isExpandable,
}) => {
  const settings = useSettings();
  const inlineThinkingMode = getInlineThinkingMode(settings);
  const itemForDisplay = useMemo(() => escapeAnsiCtrlCodes(item), [item]);

  return (
    <Box flexDirection="column" key={itemForDisplay.id} width={terminalWidth}>
      {/* Render standard message types */}
      {itemForDisplay.type === 'thinking' && inlineThinkingMode !== 'off' && (
        <ThinkingMessage thought={itemForDisplay.thought} />
      )}
      {itemForDisplay.type === 'hint' && (
        <HintMessage text={itemForDisplay.text} />
      )}
      {itemForDisplay.type === 'user' && (
        <UserMessage text={itemForDisplay.text} width={terminalWidth} />
      )}
      {itemForDisplay.type === 'user_shell' && (
        <UserShellMessage text={itemForDisplay.text} width={terminalWidth} />
      )}
      {itemForDisplay.type === 'gemini' && (
        <GeminiMessage
          text={itemForDisplay.text}
          isPending={isPending}
          availableTerminalHeight={
            availableTerminalHeightGemini ?? availableTerminalHeight
          }
          terminalWidth={terminalWidth}
        />
      )}
      {itemForDisplay.type === 'gemini_content' && (
        <GeminiMessageContent
          text={itemForDisplay.text}
          isPending={isPending}
          availableTerminalHeight={
            availableTerminalHeightGemini ?? availableTerminalHeight
          }
          terminalWidth={terminalWidth}
        />
      )}
      {itemForDisplay.type === 'info' && (
        <InfoMessage
          text={itemForDisplay.text}
          icon={itemForDisplay.icon}
          color={itemForDisplay.color}
          marginBottom={itemForDisplay.marginBottom}
        />
      )}
      {itemForDisplay.type === 'warning' && (
        <WarningMessage text={itemForDisplay.text} />
      )}
      {itemForDisplay.type === 'error' && (
        <ErrorMessage text={itemForDisplay.text} />
      )}
      {itemForDisplay.type === 'about' && (
        <AboutBox
          cliVersion={itemForDisplay.cliVersion}
          osVersion={itemForDisplay.osVersion}
          sandboxEnv={itemForDisplay.sandboxEnv}
          modelVersion={itemForDisplay.modelVersion}
          selectedAuthType={itemForDisplay.selectedAuthType}
          gcpProject={itemForDisplay.gcpProject}
          ideClient={itemForDisplay.ideClient}
          userEmail={itemForDisplay.userEmail}
          tier={itemForDisplay.tier}
        />
      )}
      {itemForDisplay.type === 'help' && commands && (
        <Help commands={commands} />
      )}
      {itemForDisplay.type === 'stats' && (
        <StatsDisplay
          duration={itemForDisplay.duration}
          quotas={itemForDisplay.quotas}
          selectedAuthType={itemForDisplay.selectedAuthType}
          userEmail={itemForDisplay.userEmail}
          tier={itemForDisplay.tier}
          currentModel={itemForDisplay.currentModel}
          quotaStats={
            itemForDisplay.pooledRemaining !== undefined ||
            itemForDisplay.pooledLimit !== undefined ||
            itemForDisplay.pooledResetTime !== undefined
              ? {
                  remaining: itemForDisplay.pooledRemaining,
                  limit: itemForDisplay.pooledLimit,
                  resetTime: itemForDisplay.pooledResetTime,
                }
              : undefined
          }
        />
      )}
      {itemForDisplay.type === 'model_stats' && (
        <ModelStatsDisplay
          selectedAuthType={itemForDisplay.selectedAuthType}
          userEmail={itemForDisplay.userEmail}
          tier={itemForDisplay.tier}
          currentModel={itemForDisplay.currentModel}
          quotaStats={
            itemForDisplay.pooledRemaining !== undefined ||
            itemForDisplay.pooledLimit !== undefined ||
            itemForDisplay.pooledResetTime !== undefined
              ? {
                  remaining: itemForDisplay.pooledRemaining,
                  limit: itemForDisplay.pooledLimit,
                  resetTime: itemForDisplay.pooledResetTime,
                }
              : undefined
          }
        />
      )}
      {itemForDisplay.type === 'tool_stats' && <ToolStatsDisplay />}
      {itemForDisplay.type === 'model' && (
        <ModelMessage model={itemForDisplay.model} />
      )}
      {itemForDisplay.type === 'quit' && (
        <SessionSummaryDisplay duration={itemForDisplay.duration} />
      )}
      {itemForDisplay.type === 'tool_group' && (
        <ToolGroupMessage
          item={itemForDisplay}
          toolCalls={itemForDisplay.tools}
          availableTerminalHeight={availableTerminalHeight}
          terminalWidth={terminalWidth}
          borderTop={itemForDisplay.borderTop}
          borderBottom={itemForDisplay.borderBottom}
          isExpandable={isExpandable}
        />
      )}
      {itemForDisplay.type === 'compression' && (
        <CompressionMessage compression={itemForDisplay.compression} />
      )}
      {itemForDisplay.type === 'extensions_list' && (
        <ExtensionsList extensions={itemForDisplay.extensions} />
      )}
      {itemForDisplay.type === 'tools_list' && (
        <ToolsList
          terminalWidth={terminalWidth}
          tools={itemForDisplay.tools}
          showDescriptions={itemForDisplay.showDescriptions}
        />
      )}
      {itemForDisplay.type === 'skills_list' && (
        <SkillsList
          skills={itemForDisplay.skills}
          showDescriptions={itemForDisplay.showDescriptions}
        />
      )}
      {itemForDisplay.type === 'agents_list' && (
        <AgentsStatus
          agents={itemForDisplay.agents}
          terminalWidth={terminalWidth}
        />
      )}
      {itemForDisplay.type === 'mcp_status' && (
        <McpStatus {...itemForDisplay} serverStatus={getMCPServerStatus} />
      )}
      {itemForDisplay.type === 'chat_list' && (
        <ChatList chats={itemForDisplay.chats} />
      )}
      {itemForDisplay.type === 'hooks_list' && (
        <HooksList hooks={itemForDisplay.hooks} />
      )}
    </Box>
  );
};
