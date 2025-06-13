/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { Colors } from '../colors.js';
import { type MCPServerConfig } from '@gemini-cli/core';

interface ContextSummaryDisplayProps {
  geminiMdFileCount: number;
  contextFileNames: string[];
  mcpServers?: Record<string, MCPServerConfig>;
  showToolDescriptions?: boolean;
}

export const ContextSummaryDisplay: React.FC<ContextSummaryDisplayProps> = ({
  geminiMdFileCount,
  contextFileNames,
  mcpServers,
  showToolDescriptions,
}) => {
  const mcpServerCount = Object.keys(mcpServers || {}).length;

  if (geminiMdFileCount === 0 && mcpServerCount === 0) {
    return <Text> </Text>; // Render an empty space to reserve height
  }

  const geminiMdText =
    geminiMdFileCount > 0
      ? `${geminiMdFileCount} ${contextFileNames[0]} file${
          geminiMdFileCount > 1 ? 's' : ''
        }`
      : '';

  const mcpText =
    mcpServerCount > 0
      ? `${mcpServerCount} MCP server${mcpServerCount > 1 ? 's' : ''}`
      : '';

  let summaryText = 'Using ';
  if (geminiMdText) {
    summaryText += geminiMdText;
  }
  if (geminiMdText && mcpText) {
    summaryText += ' and ';
  }
  if (mcpText) {
    summaryText += mcpText;
    // Add Ctrl+T hint when MCP servers are available
    if (mcpServers && Object.keys(mcpServers).length > 0) {
      if (showToolDescriptions) {
        summaryText += ' (Ctrl+T to hide descriptions)';
      } else {
        summaryText += ' (Ctrl+T to view descriptions)';
      }
    }
  }

  return <Text color={Colors.Gray}>{summaryText}</Text>;
};
