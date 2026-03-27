/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { isUserVisibleHook } from '@google/gemini-cli-core';
import type { useSettings } from '../contexts/SettingsContext.js';
import type { useUIState } from '../contexts/UIStateContext.js';
import { GENERIC_WORKING_LABEL } from '../textConstants.js';
import { LoadingIndicator } from './LoadingIndicator.js';
import { StatusDisplay } from './StatusDisplay.js';
import { ContextUsageDisplay } from './ContextUsageDisplay.js';
import { isContextUsageHigh } from '../utils/contextUsage.js';
import { getInlineThinkingMode } from '../utils/inlineThinkingMode.js';
import { ToastDisplay } from './ToastDisplay.js';
import { theme } from '../semantic-colors.js';
import { StreamingState } from '../types.js';

interface AmbientContent {
  text: string;
  isTip: boolean;
}

export interface StatusRowProps {
  uiState: ReturnType<typeof useUIState>;
  settings: ReturnType<typeof useSettings>;
  hideContextSummary: boolean;
  isNarrow: boolean;
  ambientContent: AmbientContent | null;
  showUiDetails: boolean;
  showMinimalToast: boolean;
  hideUiDetailsForSuggestions: boolean;
  hasPendingActionRequired: boolean;
}

export const StatusRow: React.FC<StatusRowProps> = ({
  uiState,
  settings,
  hideContextSummary,
  isNarrow,
  ambientContent,
  showUiDetails,
  showMinimalToast,
  hideUiDetailsForSuggestions,
  hasPendingActionRequired,
}) => {
  const inlineThinkingMode = getInlineThinkingMode(settings);
  const loadingPhrases = settings.merged.ui.loadingPhrases;
  const showTips = loadingPhrases === 'tips' || loadingPhrases === 'all';
  const showWit = loadingPhrases === 'witty' || loadingPhrases === 'all';

  const showLoadingIndicator =
    (!uiState.embeddedShellFocused || uiState.isBackgroundShellVisible) &&
    uiState.streamingState === StreamingState.Responding &&
    !hasPendingActionRequired;

  const showMinimalContextBleedThrough =
    !settings.merged.ui.footer.hideContextPercentage &&
    isContextUsageHigh(
      uiState.sessionStats.lastPromptTokenCount,
      typeof uiState.currentModel === 'string'
        ? uiState.currentModel
        : undefined,
    );

  const shouldReserveSpaceForShortcutsHint =
    settings.merged.ui.showShortcutsHint &&
    !hideUiDetailsForSuggestions &&
    !hasPendingActionRequired;

  // Hook Status Logic
  const allHooks = uiState.activeHooks;
  const userVisibleHooks = allHooks.filter((h) => isUserVisibleHook(h.source));
  let hookText: string | undefined = undefined;
  if (allHooks.length > 0) {
    hookText = GENERIC_WORKING_LABEL;
    if (userVisibleHooks.length > 0) {
      const label =
        userVisibleHooks.length > 1 ? 'Executing Hooks' : 'Executing Hook';
      const displayNames = userVisibleHooks.map((h) => {
        let name = h.name;
        if (h.index && h.total && h.total > 1) {
          name += ` (${h.index}/${h.total})`;
        }
        return name;
      });
      hookText = `${label}: ${displayNames.join(', ')}`;
    }
  }

  const showMinimalMetaRow =
    !showUiDetails &&
    (showLoadingIndicator ||
      showMinimalToast ||
      showMinimalContextBleedThrough ||
      shouldReserveSpaceForShortcutsHint);

  const renderLoadingIndicator = () => (
    <LoadingIndicator
      inline
      thought={
        uiState.streamingState === StreamingState.WaitingForConfirmation ||
        inlineThinkingMode === 'full'
          ? undefined
          : uiState.thought
      }
      currentLoadingPhrase={loadingPhrases === 'off' ? undefined : hookText}
      thoughtLabel={
        inlineThinkingMode === 'full'
          ? typeof uiState.thought === 'string'
            ? uiState.thought
            : uiState.thought?.subject || 'Thinking...'
          : undefined
      }
      elapsedTime={uiState.elapsedTime}
      showTips={showTips}
      showWit={showWit}
      wittyPhrase={uiState.currentWittyPhrase}
      errorVerbosity={settings.merged.ui.errorVerbosity}
    />
  );

  return (
    <>
      {/* Minimal UI Mode Meta Row */}
      {showMinimalMetaRow && (
        <Box
          justifyContent="space-between"
          width="100%"
          flexDirection={isNarrow ? 'column' : 'row'}
          alignItems={isNarrow ? 'flex-start' : 'center'}
        >
          <Box
            marginLeft={1}
            marginRight={isNarrow ? 0 : 1}
            flexDirection="row"
            alignItems={isNarrow ? 'flex-start' : 'center'}
            flexGrow={1}
          >
            {!showUiDetails && showLoadingIndicator && renderLoadingIndicator()}
            {showMinimalToast && (
              <Box marginLeft={!showUiDetails && showLoadingIndicator ? 1 : 0}>
                <ToastDisplay />
              </Box>
            )}
          </Box>
          {(showMinimalContextBleedThrough ||
            (ambientContent && !showUiDetails)) && (
            <Box
              marginTop={isNarrow && showMinimalToast ? 1 : 0}
              flexDirection={isNarrow ? 'column' : 'row'}
              alignItems={isNarrow ? 'flex-start' : 'flex-end'}
              minHeight={1}
            >
              {showMinimalContextBleedThrough && (
                <ContextUsageDisplay
                  promptTokenCount={uiState.sessionStats.lastPromptTokenCount}
                  model={uiState.currentModel}
                  terminalWidth={uiState.terminalWidth}
                />
              )}
              {ambientContent && !showUiDetails && (
                <Box
                  marginLeft={
                    showMinimalContextBleedThrough && !isNarrow ? 1 : 0
                  }
                  marginTop={showMinimalContextBleedThrough && isNarrow ? 1 : 0}
                >
                  <Text color={theme.text.secondary} wrap="truncate-end">
                    {ambientContent.text}
                  </Text>
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}

      {/* Below Divider Zone: Active Processing and Status */}
      {showUiDetails && (
        <Box
          justifyContent="space-between"
          width="100%"
          flexDirection={isNarrow ? 'column' : 'row'}
          alignItems={isNarrow ? 'flex-start' : 'center'}
        >
          <Box
            marginLeft={1}
            marginRight={isNarrow ? 0 : 1}
            flexDirection="row"
            alignItems="center"
            flexGrow={1}
          >
            {showLoadingIndicator && renderLoadingIndicator()}
          </Box>

          <Box
            marginTop={isNarrow ? 1 : 0}
            flexDirection="column"
            alignItems={isNarrow ? 'flex-start' : 'flex-end'}
          >
            {!showLoadingIndicator && (
              <StatusDisplay hideContextSummary={hideContextSummary} />
            )}
          </Box>
        </Box>
      )}
    </>
  );
};
