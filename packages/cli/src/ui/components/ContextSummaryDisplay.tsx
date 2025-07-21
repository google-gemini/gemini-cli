/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { Colors } from '../colors.js';
import { type OpenFiles, type MCPServerConfig } from '@google/gemini-cli-core';
import path from 'path';

interface ContextSummaryDisplayProps {
  geminiMdFileCount: number;
  contextFileNames: string[];
  mcpServers?: Record<string, MCPServerConfig>;
  blockedMcpServers?: Array<{ name: string; extensionName: string }>;
  showToolDescriptions?: boolean;
  openFiles?: OpenFiles;
}

export const ContextSummaryDisplay: React.FC<ContextSummaryDisplayProps> = ({
  geminiMdFileCount,
  contextFileNames,
  mcpServers,
  blockedMcpServers,
  showToolDescriptions,
  openFiles,
}) => {
  const mcpServerCount = Object.keys(mcpServers || {}).length;
  const blockedMcpServerCount = blockedMcpServers?.length || 0;

  if (
    geminiMdFileCount === 0 &&
    mcpServerCount === 0 &&
    blockedMcpServerCount === 0 &&
    !openFiles?.activeFile
  ) {
    return <Text> </Text>; // Render an empty space to reserve height
  }

  const activeFileText = (() => {
    if (!openFiles?.activeFile) {
      return '';
    }
    return `Open File (${path.basename(openFiles.activeFile)})`;
  })();

  const geminiMdText = (() => {
    if (geminiMdFileCount === 0) {
      return '';
    }
    const allNamesTheSame = new Set(contextFileNames).size < 2;
    const name = allNamesTheSame ? contextFileNames[0] : 'Context';
    return `${geminiMdFileCount} ${name} File${
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
        `${mcpServerCount} MCP Server${mcpServerCount > 1 ? 's' : ''}`,
      );
    }

    if (blockedMcpServerCount > 0) {
      let blockedText = `${blockedMcpServerCount} Blocked`;
      if (mcpServerCount === 0) {
        blockedText += ` MCP Server${blockedMcpServerCount > 1 ? 's' : ''}`;
      }
      parts.push(blockedText);
    }
    return parts.join(', ');
  })();

  let summaryText = 'Using: ';
  const summaryParts = [];
  if (activeFileText) {
    summaryParts.push(activeFileText);
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
