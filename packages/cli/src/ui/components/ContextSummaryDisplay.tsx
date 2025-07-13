/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { Colors } from '../colors.js';
import { type MCPServerConfig } from '@google/gemini-cli-core';

interface ContextSummaryDisplayProps {
  geminiMdFileCount: number;
  contextFileNames: string[];
  mcpServers?: Record<string, MCPServerConfig>;
  showToolDescriptions?: boolean;
  pastedImageCount?: number;
}

export const ContextSummaryDisplay: React.FC<ContextSummaryDisplayProps> = ({
  geminiMdFileCount,
  contextFileNames,
  mcpServers,
  showToolDescriptions,
  pastedImageCount = 0,
}) => {
  const mcpServerCount = Object.keys(mcpServers || {}).length;

  const geminiMdText = (() => {
    if (geminiMdFileCount === 0) {
      return '';
    }
    const allNamesTheSame = new Set(contextFileNames).size < 2;
    const name = allNamesTheSame ? contextFileNames[0] : 'context';
    return `${geminiMdFileCount} ${name} file${
      geminiMdFileCount > 1 ? 's' : ''
    }`;
  })();

  const mcpText =
    mcpServerCount > 0
      ? `${mcpServerCount} MCP server${mcpServerCount > 1 ? 's' : ''}`
      : '';

  const pastedText =
    pastedImageCount > 0
      ? `${pastedImageCount} image${pastedImageCount > 1 ? 's' : ''} staged`
      : '';

  const allParts = [geminiMdText, mcpText, pastedText].filter(Boolean);

  if (allParts.length === 0) {
    return <Text> </Text>; // Render an empty space to reserve height
  }

  let summaryText = 'Using ' + allParts.join(' and ');

  // Add ctrl+t hint when MCP servers are available
  if (mcpServerCount > 0) {
    if (showToolDescriptions) {
      summaryText += ' (ctrl+t to toggle)';
    } else {
      summaryText += ' (ctrl+t to view)';
    }
  }

  return <Text color={Colors.Gray}>{summaryText}</Text>;
};
