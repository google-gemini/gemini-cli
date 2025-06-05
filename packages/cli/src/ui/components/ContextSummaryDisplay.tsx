/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { Colors } from '../colors.js';
import { type MCPServerConfig } from '@gemini-code/core';

interface ContextSummaryDisplayProps {
  geminiMdFileCount: number;
  contextFileName: string;
  mcpServers?: Record<string, MCPServerConfig>;
}

export const ContextSummaryDisplay: React.FC<ContextSummaryDisplayProps> = ({
  geminiMdFileCount,
  contextFileName,
  mcpServers,
}) => {
  const mcpServerCount = Object.keys(mcpServers || {}).length;

  if (geminiMdFileCount === 0 && mcpServerCount === 0) {
    return <Text> </Text>; // Render an empty space to reserve height
  }

  const geminiMdText =
    geminiMdFileCount > 0
      ? `${geminiMdFileCount} ${contextFileName} file${geminiMdFileCount > 1 ? 's' : ''}`
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
  }

  return <Text color={Colors.Gray}>{summaryText}</Text>;
};
