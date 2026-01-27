/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { theme } from '../semantic-colors.js';
import { type IdeContext, type MCPServerConfig } from '@google/gemini-cli-core';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';

interface ContextSummaryDisplayProps {
  geminiMdFileCount: number;
  contextFileNames: string[];
  mcpServers?: Record<string, MCPServerConfig>;
  blockedMcpServers?: Array<{ name: string; extensionName: string }>;
  ideContext?: IdeContext;
  skillCount: number;
}

export const ContextSummaryDisplay: React.FC<ContextSummaryDisplayProps> = ({
  geminiMdFileCount,
  contextFileNames,
  mcpServers,
  blockedMcpServers,
  ideContext,
  skillCount,
}) => {
  const { t } = useTranslation('ui');
  const { columns: terminalWidth } = useTerminalSize();
  const isNarrow = isNarrowWidth(terminalWidth);
  const mcpServerCount = Object.keys(mcpServers || {}).length;
  const blockedMcpServerCount = blockedMcpServers?.length || 0;
  const openFileCount = ideContext?.workspaceState?.openFiles?.length ?? 0;

  if (
    geminiMdFileCount === 0 &&
    mcpServerCount === 0 &&
    blockedMcpServerCount === 0 &&
    openFileCount === 0 &&
    skillCount === 0
  ) {
    return <Text> </Text>; // Render an empty space to reserve height
  }

  const openFilesText = (() => {
    if (openFileCount === 0) {
      return '';
    }
    return t('contextSummary.openFiles', { count: openFileCount });
  })();

  const geminiMdText = (() => {
    if (geminiMdFileCount === 0) {
      return '';
    }
    const allNamesTheSame = new Set(contextFileNames).size < 2;
    const name = allNamesTheSame
      ? contextFileNames[0]
      : t('contextSummary.contextGenericName');
    return t('contextSummary.contextFiles', { count: geminiMdFileCount, name });
  })();

  const mcpText = (() => {
    if (mcpServerCount === 0 && blockedMcpServerCount === 0) {
      return '';
    }

    const parts = [];
    if (mcpServerCount > 0) {
      parts.push(t('contextSummary.mcpServers', { count: mcpServerCount }));
    }

    if (blockedMcpServerCount > 0) {
      const blockedText =
        mcpServerCount === 0
          ? t('contextSummary.blockedMcpServers', {
              count: blockedMcpServerCount,
            })
          : t('contextSummary.blockedOnly', { count: blockedMcpServerCount });
      parts.push(blockedText);
    }
    return parts.join(', ');
  })();

  const skillText = (() => {
    if (skillCount === 0) {
      return '';
    }
    return t('contextSummary.skills', { count: skillCount });
  })();

  const summaryParts = [openFilesText, geminiMdText, mcpText, skillText].filter(
    Boolean,
  );

  if (isNarrow) {
    return (
      <Box flexDirection="column" paddingX={1}>
        {summaryParts.map((part, index) => (
          <Text key={index} color={theme.text.secondary}>
            - {part}
          </Text>
        ))}
      </Box>
    );
  }

  return (
    <Box paddingX={1}>
      <Text color={theme.text.secondary}>{summaryParts.join(' | ')}</Text>
    </Box>
  );
};
