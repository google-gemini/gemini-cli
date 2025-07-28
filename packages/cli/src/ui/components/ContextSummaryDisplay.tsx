/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { Colors } from '../colors.js';
import { type IdeContext, type MCPServerConfig } from '@google/gemini-cli-core';

interface ContextSummaryDisplayProps {
  geminiMdFileCount: number;
  contextFileNames: string[];
  mcpServers?: Record<string, MCPServerConfig>;
  blockedMcpServers?: Array<{ name: string; extensionName: string }>;
  showToolDescriptions?: boolean;
  ideContext?: IdeContext;
}

export const ContextSummaryDisplay: React.FC<ContextSummaryDisplayProps> = ({
  geminiMdFileCount,
  contextFileNames,
  mcpServers,
  blockedMcpServers,
  showToolDescriptions,
  ideContext,
}) => {
  const mcpServerCount = Object.keys(mcpServers || {}).length;
  const blockedMcpServerCount = blockedMcpServers?.length || 0;
  const openFileCount = ideContext?.workspaceState?.openFiles?.length ?? 0;

  if (
    geminiMdFileCount === 0 &&
    mcpServerCount === 0 &&
    blockedMcpServerCount === 0 &&
    openFileCount === 0
  ) {
    return <Text> </Text>; // Render an empty space to reserve height
  }

  const openFilesText = (() => {
    if (openFileCount === 0) {
      return '';
    }
    return `${openFileCount} open file${
      openFileCount > 1 ? 's' : ''
    } (ctrl+e to view)`;
  })();

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

  const mcpText = (() => {
    if (mcpServerCount === 0 && blockedMcpServerCount === 0) {
      return '';
    }

    const parts = [];
    if (mcpServerCount > 0) {
      parts.push(
        `${mcpServerCount} MCP server${mcpServerCount > 1 ? 's' : ''}`,
      );
    }

    if (blockedMcpServerCount > 0) {
      let blockedText = `${blockedMcpServerCount} Blocked`;
      if (mcpServerCount === 0) {
        blockedText += ` MCP server${blockedMcpServerCount > 1 ? 's' : ''}`;
      }
      parts.push(blockedText);
    }
    return parts.join(', ');
  })();

  let summaryText = 'Using: ';
  const summaryParts = [];
  if (openFilesText) {
    summaryParts.push(openFilesText);
  }
  if (geminiMdText) {
    summaryParts.push(geminiMdText);
  }
  if (mcpText) {
    summaryParts.push(mcpText);
  }
  summaryText += summaryParts.join(' | ');

  // Add ctrl+t hint when MCP servers are available
  if (mcpServers && Object.keys(mcpServers).length > 0) {
    if (showToolDescriptions) {
      summaryText += ' (ctrl+t to toggle)';
    } else {
      summaryText += ' (ctrl+t to view)';
    }
  }

  return <Text color={Colors.Gray}>{summaryText}</Text>;
};
