/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import type { HistoryItemContext } from '../types.js';

const PROGRESS_BAR_WIDTH = 20;

interface ContextDisplayProps {
  item: HistoryItemContext;
}

/**
 * Creates a visual progress bar with colored blocks
 */
const ProgressBar: React.FC<{
  used: number;
  total: number;
  breakdown?: {
    systemPrompt: number;
    tools: number;
    mcpTools: number;
    memory: number;
    messages: number;
  };
}> = ({ used, total, breakdown }) => {
  const percentage = Math.min((used / total) * 100, 100);
  const filledBlocks = Math.round((percentage / 100) * PROGRESS_BAR_WIDTH);

  // If we have breakdown, color-code the blocks
  if (breakdown) {
    const blocks = [];
    const colors = [
      theme.text.link, // system prompt
      theme.status.warning, // tools
      '#8B5CF6', // mcp tools (purple)
      '#06B6D4', // memory (cyan)
      '#10B981', // messages (green)
    ];

    let blockIndex = 0;
    const totalTokens = used;

    // Calculate blocks for each component
    const components = [
      breakdown.systemPrompt,
      breakdown.tools,
      breakdown.mcpTools,
      breakdown.memory,
      breakdown.messages,
    ];

    components.forEach((componentTokens, i) => {
      const componentBlocks = Math.round(
        (componentTokens / totalTokens) * filledBlocks,
      );
      for (
        let j = 0;
        j < componentBlocks && blockIndex < PROGRESS_BAR_WIDTH;
        j++
      ) {
        blocks.push(
          <Text key={`filled-${blockIndex}`} color={colors[i]}>
            ▓
          </Text>,
        );
        blockIndex++;
      }
    });

    // Fill remaining blocks as empty
    for (let i = blockIndex; i < PROGRESS_BAR_WIDTH; i++) {
      blocks.push(
        <Text key={`empty-${i}`} dimColor>
          ░
        </Text>,
      );
    }

    return <Box>{blocks}</Box>;
  }

  // Simple progress bar without breakdown
  const blocks = [];
  for (let i = 0; i < PROGRESS_BAR_WIDTH; i++) {
    if (i < filledBlocks) {
      const color =
        percentage >= 90
          ? theme.status.error
          : percentage >= 70
            ? theme.status.warning
            : theme.status.success;
      blocks.push(
        <Text key={i} color={color}>
          ▓
        </Text>,
      );
    } else {
      blocks.push(
        <Text key={i} dimColor>
          ░
        </Text>,
      );
    }
  }
  return <Box>{blocks}</Box>;
};

export const ContextDisplay: React.FC<ContextDisplayProps> = ({ item }) => {
  const { breakdown } = item;

  if (!breakdown) {
    return (
      <Box paddingY={1}>
        <Text color={theme.status.error}>
          Unable to gather context information
        </Text>
      </Box>
    );
  }

  const {
    model,
    currentTokens,
    maxTokens,
    systemPromptTokens,
    toolsTokens,
    mcpToolsTokens,
    memoryTokens,
    messagesTokens,
    mcpTools,
    memoryFiles,
    slashCommands,
  } = breakdown;

  const usagePercent = (currentTokens / maxTokens) * 100;
  const freeSpace = maxTokens - currentTokens;
  const freeSpacePercent = (freeSpace / maxTokens) * 100;

  // Format numbers with k suffix
  const formatNumber = (num: number): string => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  };

  // Group MCP tools by server
  const toolsByServer = new Map<string, typeof mcpTools>();
  mcpTools.forEach((tool) => {
    if (!toolsByServer.has(tool.server)) {
      toolsByServer.set(tool.server, []);
    }
    toolsByServer.get(tool.server)!.push(tool);
  });

  return (
    <Box flexDirection="column" paddingY={1}>
      {/* Header */}
      <Text bold color={theme.text.accent}>
        Context Usage
      </Text>
      <Box height={1} />

      {/* Progress Bar */}
      <Box flexDirection="row" gap={1}>
        <ProgressBar
          used={currentTokens}
          total={maxTokens}
          breakdown={{
            systemPrompt: systemPromptTokens,
            tools: toolsTokens,
            mcpTools: mcpToolsTokens,
            memory: memoryTokens,
            messages: messagesTokens,
          }}
        />
        <Text color={theme.text.primary}>
          {model} • {formatNumber(currentTokens)}/{formatNumber(maxTokens)}{' '}
          tokens ({usagePercent.toFixed(0)}%)
        </Text>
      </Box>

      <Box height={1} />

      {/* Breakdown */}
      <Box flexDirection="column">
        {systemPromptTokens > 0 && (
          <Box>
            <Text color={theme.text.link}>□ System prompt: </Text>
            <Text color={theme.text.primary}>
              {formatNumber(systemPromptTokens)} tokens (
              {((systemPromptTokens / maxTokens) * 100).toFixed(1)}%)
            </Text>
          </Box>
        )}

        {toolsTokens > 0 && (
          <Box>
            <Text color={theme.status.warning}>□ System tools: </Text>
            <Text color={theme.text.primary}>
              {formatNumber(toolsTokens)} tokens (
              {((toolsTokens / maxTokens) * 100).toFixed(1)}%)
            </Text>
          </Box>
        )}

        {mcpToolsTokens > 0 && (
          <Box>
            <Text color="#8B5CF6">□ MCP tools: </Text>
            <Text color={theme.text.primary}>
              {formatNumber(mcpToolsTokens)} tokens (
              {((mcpToolsTokens / maxTokens) * 100).toFixed(1)}%)
            </Text>
          </Box>
        )}

        {memoryTokens > 0 && (
          <Box>
            <Text color="#06B6D4">□ Memory files: </Text>
            <Text color={theme.text.primary}>
              {formatNumber(memoryTokens)} tokens (
              {((memoryTokens / maxTokens) * 100).toFixed(1)}%)
            </Text>
          </Box>
        )}

        {messagesTokens > 0 && (
          <Box>
            <Text color="#10B981">□ Messages: </Text>
            <Text color={theme.text.primary}>
              {formatNumber(messagesTokens)} tokens (
              {((messagesTokens / maxTokens) * 100).toFixed(1)}%)
            </Text>
          </Box>
        )}

        <Box>
          <Text dimColor>□ Free space: </Text>
          <Text color={theme.text.primary}>
            {formatNumber(freeSpace)} ({freeSpacePercent.toFixed(1)}%)
          </Text>
        </Box>
      </Box>

      {/* MCP Tools Section */}
      {mcpTools.length > 0 && (
        <>
          <Box height={1} />
          <Text bold color={theme.text.accent}>
            MCP tools • /{Array.from(toolsByServer.keys()).join(', /')}
          </Text>
          <Box height={1} />
          <Box flexDirection="column">
            {Array.from(toolsByServer.entries()).map(([server, tools]) =>
              tools.map((tool) => (
                <Box key={tool.name}>
                  <Text dimColor>└ </Text>
                  <Text color={theme.text.primary}>
                    {tool.name.replace('mcp__', '').replace(/__/g, '_')}{' '}
                  </Text>
                  <Text dimColor>({server}): </Text>
                  <Text color={theme.text.primary}>{tool.tokens} tokens</Text>
                </Box>
              )),
            )}
          </Box>
        </>
      )}

      {/* Memory Files Section */}
      {memoryFiles.length > 0 && (
        <>
          <Box height={1} />
          <Text bold color={theme.text.accent}>
            Memory files • /memory
          </Text>
          <Box height={1} />
          <Box flexDirection="column">
            {memoryFiles.map((file) => (
              <Box key={file.path}>
                <Text dimColor>└ </Text>
                <Text color={theme.text.primary}>{file.path}: </Text>
                <Text dimColor>{file.tokens} tokens</Text>
              </Box>
            ))}
          </Box>
        </>
      )}

      {/* SlashCommand Tools Section */}
      {slashCommands > 0 && (
        <>
          <Box height={1} />
          <Text bold color={theme.text.accent}>
            SlashCommand Tool • {slashCommands} commands
          </Text>
          <Box>
            <Text dimColor>└ Total: {slashCommands} tokens</Text>
          </Box>
        </>
      )}
    </Box>
  );
};
