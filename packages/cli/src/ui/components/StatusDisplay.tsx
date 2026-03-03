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

  // In legacy layout, we show hooks here.
  // In experimental layout, hooks are shown in the top row of the composer,
  // but we still show them here if they are "system" hooks or if notifications are enabled.
  const isLegacyLayout =
    (settings.merged.ui as Record<string, unknown>)['useLegacyLayout'] === true;

  if (
    isLegacyLayout &&
    uiState.activeHooks.length > 0 &&
    settings.merged.hooksConfig.notifications
  ) {
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
        backgroundProcessCount={uiState.backgroundShellCount}
      />
    );
  }

  return null;
};
