/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import {
  isUserVisibleHook,
  type ThoughtSummary,
} from '@google/gemini-cli-core';
import { type ActiveHook } from '../types.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { theme } from '../semantic-colors.js';
import { GENERIC_WORKING_LABEL } from '../textConstants.js';
import { INTERACTIVE_SHELL_WAITING_PHRASE } from '../hooks/usePhraseCycler.js';
import { isContextUsageHigh } from '../utils/contextUsage.js';
import { getCachedStringWidth } from '../utils/textUtils.js';
import { LoadingIndicator } from './LoadingIndicator.js';
import { StatusDisplay } from './StatusDisplay.js';
import { ContextUsageDisplay } from './ContextUsageDisplay.js';
import { HorizontalLine } from './shared/HorizontalLine.js';
import { ApprovalModeIndicator } from './ApprovalModeIndicator.js';
import { ShellModeIndicator } from './ShellModeIndicator.js';
import { RawMarkdownIndicator } from './RawMarkdownIndicator.js';

export const estimateStatusWidth = (
  activeHooks: ActiveHook[],
  showLoadingIndicator: boolean,
  thought: ThoughtSummary | null,
  currentWittyPhrase: string | undefined,
  showWit: boolean,
  isInteractiveShellWaiting: boolean,
): number => {
  if (isInteractiveShellWaiting) {
    return getCachedStringWidth(INTERACTIVE_SHELL_WAITING_PHRASE);
  }

  if (activeHooks.length > 0) {
    const userVisibleHooks = activeHooks.filter((h) =>
      isUserVisibleHook(h.source),
    );
    let hookText = GENERIC_WORKING_LABEL;
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
    return getCachedStringWidth(hookText) + 10;
  }

  if (showLoadingIndicator) {
    const thoughtText = thought?.subject || GENERIC_WORKING_LABEL;
    const thinkingIndicator =
      thought?.subject && !thoughtText.startsWith('Thinking')
        ? 'Thinking... '
        : '';
    const wittyText =
      showWit && currentWittyPhrase ? ` ${currentWittyPhrase}` : '';
    // Estimate timer length: "(esc to cancel, 99s)" is ~20 chars
    const timerEstimate = ' (esc to cancel, 99s)';
    return (
      getCachedStringWidth(thinkingIndicator + thoughtText + wittyText) +
      timerEstimate.length +
      5
    );
  }

  return 0;
};

interface StatusRowProps {
  showUiDetails: boolean;
  isNarrow: boolean;
  terminalWidth: number;
  showTips: boolean;
  showWit: boolean;
  tipContentStr: string | undefined;
  showTipLine: boolean;
  estimatedStatusLength: number;
  hideContextSummary: boolean;
  modeContentObj: { text: string; color: string } | null;
  hideUiDetailsForSuggestions: boolean;
}

export const StatusNode: React.FC<{
  showTips: boolean;
  showWit: boolean;
  thought: ThoughtSummary | null;
  elapsedTime: number;
  currentWittyPhrase: string | undefined;
  activeHooks: ActiveHook[];
  showLoadingIndicator: boolean;
  errorVerbosity: 'low' | 'full' | undefined;
}> = ({
  showTips,
  showWit,
  thought,
  elapsedTime,
  currentWittyPhrase,
  activeHooks,
  showLoadingIndicator,
  errorVerbosity,
}) => {
  if (activeHooks.length === 0 && !showLoadingIndicator) return null;

  let currentLoadingPhrase: string | undefined = undefined;
  let currentThought: ThoughtSummary | null = null;

  if (activeHooks.length > 0) {
    const userVisibleHooks = activeHooks.filter((h) =>
      isUserVisibleHook(h.source),
    );

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
      currentLoadingPhrase = `${label}: ${displayNames.join(', ')}`;
    } else {
      currentLoadingPhrase = GENERIC_WORKING_LABEL;
    }
  } else {
    currentThought = thought;
  }

  return (
    <LoadingIndicator
      inline
      showTips={showTips}
      showWit={showWit}
      errorVerbosity={errorVerbosity}
      thought={currentThought}
      currentLoadingPhrase={currentLoadingPhrase}
      elapsedTime={elapsedTime}
      forceRealStatusOnly={false}
      wittyPhrase={currentWittyPhrase}
    />
  );
};

export const StatusRow: React.FC<StatusRowProps> = ({
  showUiDetails,
  isNarrow,
  terminalWidth,
  showTips,
  showWit,
  tipContentStr,
  showTipLine,
  hideContextSummary,
  modeContentObj,
  hideUiDetailsForSuggestions,
}) => {
  const uiState = useUIState();
  const settings = useSettings();

  const isInteractiveShellWaiting = uiState.currentLoadingPhrase?.includes(
    INTERACTIVE_SHELL_WAITING_PHRASE,
  );

  const showLoadingIndicator =
    (!uiState.embeddedShellFocused || uiState.isBackgroundShellVisible) &&
    uiState.streamingState === 'responding' &&
    !(
      uiState.pendingHistoryItems?.some(
        (item) =>
          item.type === 'tool_group' &&
          item.tools.some((t) => t.status === 'awaiting_approval'),
      ) ||
      uiState.commandConfirmationRequest ||
      uiState.authConsentRequest ||
      (uiState.confirmUpdateExtensionRequests?.length ?? 0) > 0 ||
      uiState.loopDetectionConfirmationRequest ||
      uiState.quota.proQuotaRequest ||
      uiState.quota.validationRequest ||
      uiState.customDialog
    );

  const hasAnyHooks = uiState.activeHooks.length > 0;

  const showMinimalStatus = showLoadingIndicator || hasAnyHooks;

  const showMinimalApprovalMode =
    Boolean(modeContentObj) && !hideUiDetailsForSuggestions;

  const showMinimalContext = isContextUsageHigh(
    uiState.sessionStats.lastPromptTokenCount,
    uiState.currentModel,
    settings.merged.model?.compressionThreshold,
  );

  const showRow1Minimal = showMinimalStatus || showTipLine;
  const showRow2Minimal = showMinimalApprovalMode || showMinimalContext;

  const showRow1 = showUiDetails || showRow1Minimal;
  const showRow2 = showUiDetails || showRow2Minimal;

  const statusNode = (
    <StatusNode
      showTips={showTips}
      showWit={showWit}
      thought={uiState.thought}
      elapsedTime={uiState.elapsedTime}
      currentWittyPhrase={uiState.currentWittyPhrase}
      activeHooks={uiState.activeHooks}
      showLoadingIndicator={showLoadingIndicator}
      errorVerbosity={
        settings.merged.ui.errorVerbosity as 'low' | 'full' | undefined
      }
    />
  );

  const renderTipNode = () => {
    if (!tipContentStr) return null;

    const isShortcutHint =
      tipContentStr === '? for shortcuts' ||
      tipContentStr === 'press tab twice for more';
    const color =
      isShortcutHint && uiState.shortcutsHelpVisible
        ? theme.text.accent
        : theme.text.secondary;

    return (
      <Box flexDirection="row" justifyContent="flex-end">
        <Text
          color={color}
          wrap="truncate-end"
          italic={
            !isShortcutHint && tipContentStr === uiState.currentWittyPhrase
          }
        >
          {tipContentStr === uiState.currentTip
            ? `Tip: ${tipContentStr}`
            : tipContentStr}
        </Text>
      </Box>
    );
  };

  if (!showUiDetails && !showRow1Minimal && !showRow2Minimal) {
    return <Box height={1} />;
  }

  return (
    <Box flexDirection="column" width="100%">
      {showRow1 && (
        <Box
          width="100%"
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          minHeight={1}
        >
          <Box flexDirection="row" flexGrow={1} flexShrink={1}>
            {!showUiDetails && showRow1Minimal ? (
              <Box flexDirection="row" columnGap={1}>
                {statusNode}
                {!showUiDetails && showRow2Minimal && modeContentObj && (
                  <Box>
                    <Text color={modeContentObj.color}>
                      ● {modeContentObj.text}
                    </Text>
                  </Box>
                )}
              </Box>
            ) : isInteractiveShellWaiting ? (
              <Box width="100%" marginLeft={1}>
                <Text color={theme.status.warning}>
                  ! Shell awaiting input (Tab to focus)
                </Text>
              </Box>
            ) : (
              <Box
                flexDirection="row"
                alignItems={isNarrow ? 'flex-start' : 'center'}
                flexGrow={1}
                flexShrink={0}
                marginLeft={1}
              >
                {statusNode}
              </Box>
            )}
          </Box>

          <Box flexShrink={0} marginLeft={2} marginRight={isNarrow ? 0 : 1}>
            {!isNarrow && showTipLine && renderTipNode()}
          </Box>
        </Box>
      )}

      {showRow1 &&
        showRow2 &&
        (showUiDetails || (showRow1Minimal && showRow2Minimal)) && (
          <Box width="100%">
            <HorizontalLine dim />
          </Box>
        )}

      {showRow2 && (
        <Box
          width="100%"
          flexDirection={isNarrow ? 'column' : 'row'}
          alignItems={isNarrow ? 'flex-start' : 'center'}
          justifyContent="space-between"
        >
          <Box flexDirection="row" alignItems="center" marginLeft={1}>
            {showUiDetails ? (
              <>
                {!hideUiDetailsForSuggestions && !uiState.shellModeActive && (
                  <ApprovalModeIndicator
                    approvalMode={uiState.showApprovalModeIndicator}
                    allowPlanMode={uiState.allowPlanMode}
                  />
                )}
                {uiState.shellModeActive && (
                  <Box marginLeft={1}>
                    <ShellModeIndicator />
                  </Box>
                )}
                {!uiState.renderMarkdown && (
                  <Box marginLeft={1}>
                    <RawMarkdownIndicator />
                  </Box>
                )}
              </>
            ) : (
              showMinimalApprovalMode &&
              modeContentObj && (
                <Text color={modeContentObj.color}>
                  ● {modeContentObj.text}
                </Text>
              )
            )}
          </Box>
          <Box
            marginTop={isNarrow ? 1 : 0}
            flexDirection="row"
            alignItems="center"
            marginLeft={isNarrow ? 1 : 0}
          >
            {(showUiDetails || showMinimalContext) && (
              <StatusDisplay hideContextSummary={hideContextSummary} />
            )}
            {showMinimalContext && !showUiDetails && (
              <Box marginLeft={1}>
                <ContextUsageDisplay
                  promptTokenCount={uiState.sessionStats.lastPromptTokenCount}
                  model={
                    typeof uiState.currentModel === 'string'
                      ? uiState.currentModel
                      : undefined
                  }
                  terminalWidth={terminalWidth}
                />
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};
