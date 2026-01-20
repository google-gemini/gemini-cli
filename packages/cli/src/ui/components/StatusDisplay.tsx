/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
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

  if (process.env['GEMINI_SYSTEM_MD']) {
    return <Text color={theme.status.error}>|⌐■_■|</Text>;
  }

  if (uiState.ctrlCPressedOnce) {
    return (
      <Text color={theme.status.warning}>Press Ctrl+C again to exit.</Text>
    );
  }

  if (uiState.warningMessage) {
    return <Text color={theme.status.warning}>{uiState.warningMessage}</Text>;
  }

  if (uiState.ctrlDPressedOnce) {
    return (
      <Text color={theme.status.warning}>Press Ctrl+D again to exit.</Text>
    );
  }

  if (uiState.showEscapePrompt) {
    return <Text color={theme.text.secondary}>Press Esc again to rewind.</Text>;
  }

  if (uiState.queueErrorMessage) {
    return <Text color={theme.status.error}>{uiState.queueErrorMessage}</Text>;
  }

  if (uiState.activeHooks.length > 0 && settings.merged.hooks.notifications) {
    return <HookStatusDisplay activeHooks={uiState.activeHooks} />;
  }

  if (!settings.merged.ui.hideContextSummary && !hideContextSummary) {
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
      />
    );
  }

  return null;
};
