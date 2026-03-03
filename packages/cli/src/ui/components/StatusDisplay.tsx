/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { ContextSummaryDisplay } from './ContextSummaryDisplay.js';
import { HookStatusDisplay } from './HookStatusDisplay.js';

interface StatusDisplayProps {
  hideContextSummary: boolean;
}

export const StatusDisplay: React.FC<StatusDisplayProps> = ({
  hideContextSummary,
}) => {
  const uiState = useUIState();
  const settings = useSettings();
  const config = useConfig();

  const items: React.ReactNode[] = [];

  if (process.env['GEMINI_SYSTEM_MD']) {
    items.push(<Text color={theme.status.error}>|⌐■_■|</Text>);
  }

  if (
    uiState.activeHooks.length > 0 &&
    settings.merged.hooksConfig.notifications
  ) {
    items.push(<HookStatusDisplay activeHooks={uiState.activeHooks} />);
  }

  if (uiState.sisyphusSecondsRemaining !== null) {
    const mins = Math.floor(uiState.sisyphusSecondsRemaining / 60);
    const secs = uiState.sisyphusSecondsRemaining % 60;
    const timerStr = `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
    items.push(
      <Text color={theme.text.accent}>✦ Resuming work in {timerStr}</Text>,
    );
  }

  if (
    items.length === 0 &&
    uiState.sisyphusSecondsRemaining === null &&
    !settings.merged.ui.hideContextSummary &&
    !hideContextSummary
  ) {
    return (
      <ContextSummaryDisplay
        ideContext={uiState.ideContextState}
        geminiMdFileCount={uiState.geminiMdFileCount}
        contextFileNames={uiState.contextFileNames}
        mcpServers={config.getMcpClientManager()?.getMcpServers() ?? {}}
        blockedMcpServers={
          config.getMcpClientManager()?.getBlockedMcpServers() ?? []
        }
        skillCount={config.getSkillManager().getDisplayableSkills().length}
        backgroundProcessCount={uiState.backgroundShellCount}
      />
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="row">
      {items.map((item, index) => (
        <Box key={index} marginRight={index < items.length - 1 ? 1 : 0}>
          {item}
        </Box>
      ))}
    </Box>
  );
};
