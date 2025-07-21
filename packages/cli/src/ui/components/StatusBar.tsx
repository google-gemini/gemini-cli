/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import {
  ApprovalMode,
  tildeifyPath,
  tokenLimit,
  type MCPServerConfig,
} from '@google/gemini-cli-core';

interface StatusBarProps {
  // Directory and file info
  targetDir: string;
  branchName?: string;

  // Context info
  geminiMdFileCount: number;
  contextFileNames: string[];
  mcpServers?: Record<string, MCPServerConfig>;

  // Model and usage info
  model: string;
  promptTokenCount: number;

  // Mode indicators
  approvalMode: ApprovalMode;
  shellModeActive: boolean;
  debugMode: boolean;
  debugMessage: string;

  // Display options
  compact?: boolean;
  showSandbox?: boolean;
  showKeyboardHints?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  targetDir,
  branchName: _branchName,
  geminiMdFileCount,
  contextFileNames,
  mcpServers,
  model,
  promptTokenCount,
  approvalMode,
  shellModeActive,
  debugMode: _debugMode,
  debugMessage: _debugMessage,
  compact: _compact = true,
  showSandbox: _showSandbox = true,
  showKeyboardHints: _showKeyboardHints = false,
}) => {
  const limit = tokenLimit(model);
  const contextPercentage = ((1 - promptTokenCount / limit) * 100).toFixed(0);
  const mcpServerCount = Object.keys(mcpServers || {}).length;

  // Simplify model name - remove preview dates and experimental suffixes
  const simplifyModelName = (modelName: string): string =>
    modelName
      .replace(/-preview-\d{2}-\d{2}$/, '') // Remove -preview-05-06 style dates
      .replace(/-experimental$/, ''); // Remove -experimental suffix;

  // Build top line - mode indicators and context usage
  const buildTopLine = (): React.ReactNode => {
    const parts: React.ReactNode[] = [];

    if (shellModeActive) {
      parts.push(
        <Text key="shell" color={Colors.AccentBlue}>
          shell mode
        </Text>,
      );
    } else if (approvalMode === ApprovalMode.AUTO_EDIT) {
      parts.push(
        <Text key="edit" color={Colors.AccentGreen}>
          accepting edits
        </Text>,
      );
      parts.push(
        <Text key="edit-hint" color={Colors.Gray}>
          {' '}
          (shift + tab to toggle)
        </Text>,
      );
    } else if (approvalMode === ApprovalMode.YOLO) {
      parts.push(
        <Text key="yolo" color={Colors.AccentRed}>
          YOLO
        </Text>,
      );
    }

    // Always show context usage on the right
    return (
      <Box width="100%" justifyContent="space-between">
        <Box>{parts.length > 0 ? parts : <Text> </Text>}</Box>
        <Text color={Colors.Gray}>{contextPercentage}% context</Text>
      </Box>
    );
  };

  // Build bottom line - directory, model, MCP, and context info
  const buildBottomLine = (): React.ReactNode => {
    const parts: React.ReactNode[] = [];

    // Directory - limit to last 3 directories if path is long
    const formatDirectory = (dir: string): string => {
      const tildeDir = tildeifyPath(dir);
      const pathParts = tildeDir.split('/').filter((part) => part !== '');

      // If path has more than 3 parts, show only the last 3 with ellipsis
      if (pathParts.length > 3) {
        return '.../' + pathParts.slice(-3).join('/');
      }

      return tildeDir;
    };

    parts.push(
      <Text key="dir" color={Colors.Gray}>
        {formatDirectory(targetDir)}
      </Text>,
    );

    // Model (simplified)
    parts.push(
      <Text key="model" color={Colors.Gray}>
        {' '}
        {simplifyModelName(model)}
      </Text>,
    );

    // MCP and context info on the right
    const rightParts: React.ReactNode[] = [];

    if (mcpServerCount > 0) {
      rightParts.push(
        <Text key="mcp" color={Colors.Gray}>
          {mcpServerCount} MCP
        </Text>,
      );
    }

    if (geminiMdFileCount > 0) {
      const allNamesTheSame = new Set(contextFileNames).size < 2;
      let name = allNamesTheSame ? contextFileNames[0] : 'Instruction';
      if (geminiMdFileCount > 1 && !allNamesTheSame) {
        name += 's';
      }
      if (rightParts.length > 0) {
        rightParts.push(
          <Text key="sep1" color={Colors.Gray}>
            {' '}
          </Text>,
        );
      }
      rightParts.push(
        <Text key="context" color={Colors.Gray}>
          {geminiMdFileCount} {name}
        </Text>,
      );
    }

    return (
      <Box width="100%" justifyContent="space-between">
        <Box>{parts}</Box>
        <Box>{rightParts}</Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" width="100%">
      {buildTopLine()}
      <Box marginTop={1}>{buildBottomLine()}</Box>
    </Box>
  );
};
