/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ApprovalMode,
  checkExhaustive,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';
import { Box, useIsScreenReaderEnabled } from 'ink';
import { useState, useEffect, useMemo } from 'react';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useVimMode } from '../contexts/VimModeContext.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';
import { theme } from '../semantic-colors.js';
import { getCachedStringWidth } from '../utils/textUtils.js';

/**
 * Minimum gap between the status indicator and a tip.
 */
const STATUS_TIP_MIN_GAP = 10;

/**
 * Buffer to prevent tip collisions with terminal boundaries.
 */
const TIP_COLLISION_BUFFER = 5;

import { INTERACTIVE_SHELL_WAITING_PHRASE } from '../hooks/usePhraseCycler.js';
import { StreamingState, type HistoryItemToolGroup } from '../types.js';
import { ToastDisplay, shouldShowToast } from './ToastDisplay.js';
import { DetailedMessagesDisplay } from './DetailedMessagesDisplay.js';
import { ShortcutsHelp } from './ShortcutsHelp.js';
import { InputPrompt } from './InputPrompt.js';
import { Footer } from './Footer.js';
import { StatusRow, estimateStatusWidth } from './StatusRow.js';
import { ShowMoreLines } from './ShowMoreLines.js';
import { QueuedMessageDisplay } from './QueuedMessageDisplay.js';
import { OverflowProvider } from '../contexts/OverflowContext.js';
import { ConfigInitDisplay } from './ConfigInitDisplay.js';
import { TodoTray } from './messages/Todo.js';

export const Composer = ({ isFocused = true }: { isFocused?: boolean }) => {
  const uiState = useUIState();
  const uiActions = useUIActions();
  const settings = useSettings();
  const config = useConfig();
  const { vimEnabled, vimMode } = useVimMode();
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const { columns: terminalWidth } = useTerminalSize();
  const isNarrow = isNarrowWidth(terminalWidth);
  const debugConsoleMaxHeight = Math.floor(Math.max(terminalWidth * 0.2, 5));
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);

  const isAlternateBuffer = useAlternateBuffer();
  const showApprovalModeIndicator = uiState.showApprovalModeIndicator;
  const loadingPhrases = settings.merged.ui.loadingPhrases;
  const showTips = loadingPhrases === 'tips' || loadingPhrases === 'all';
  const showWit = loadingPhrases === 'witty' || loadingPhrases === 'all';

  const showUiDetails = uiState.cleanUiDetailsVisible;
  const suggestionsPosition = isAlternateBuffer ? 'above' : 'below';
  const hideContextSummary =
    suggestionsVisible && suggestionsPosition === 'above';

  const hasPendingToolConfirmation = useMemo(
    () =>
      (uiState.pendingHistoryItems ?? [])
        .filter(
          (item): item is HistoryItemToolGroup => item.type === 'tool_group',
        )
        .some((item) =>
          item.tools.some(
            (tool) => tool.status === CoreToolCallStatus.AwaitingApproval,
          ),
        ),
    [uiState.pendingHistoryItems],
  );

  const hasPendingActionRequired =
    hasPendingToolConfirmation ||
    Boolean(uiState.commandConfirmationRequest) ||
    Boolean(uiState.authConsentRequest) ||
    (uiState.confirmUpdateExtensionRequests?.length ?? 0) > 0 ||
    Boolean(uiState.loopDetectionConfirmationRequest) ||
    Boolean(uiState.quota.proQuotaRequest) ||
    Boolean(uiState.quota.validationRequest) ||
    Boolean(uiState.customDialog);

  const isPassiveShortcutsHelpState =
    uiState.isInputActive &&
    uiState.streamingState === StreamingState.Idle &&
    !hasPendingActionRequired;

  const { setShortcutsHelpVisible } = uiActions;

  useEffect(() => {
    if (uiState.shortcutsHelpVisible && !isPassiveShortcutsHelpState) {
      setShortcutsHelpVisible(false);
    }
  }, [
    uiState.shortcutsHelpVisible,
    isPassiveShortcutsHelpState,
    setShortcutsHelpVisible,
  ]);

  const showShortcutsHelp =
    uiState.shortcutsHelpVisible &&
    uiState.streamingState === StreamingState.Idle &&
    !hasPendingActionRequired;

  /**
   * Use the setting if provided, otherwise default to true for the new UX.
   * This allows tests to override the collapse behavior.
   */
  const shouldCollapseDuringApproval =
    settings.merged.ui.collapseDrawerDuringApproval !== false;

  if (hasPendingActionRequired && shouldCollapseDuringApproval) {
    return null;
  }

  const hasToast = shouldShowToast(uiState);
  const showLoadingIndicator =
    (!uiState.embeddedShellFocused || uiState.isBackgroundShellVisible) &&
    uiState.streamingState === StreamingState.Responding &&
    !hasPendingActionRequired;

  const hideUiDetailsForSuggestions =
    suggestionsVisible && suggestionsPosition === 'above';

  let modeBleedThrough: { text: string; color: string } | null = null;
  switch (showApprovalModeIndicator) {
    case ApprovalMode.YOLO:
      modeBleedThrough = { text: 'YOLO', color: theme.status.error };
      break;
    case ApprovalMode.PLAN:
      modeBleedThrough = { text: 'plan', color: theme.status.success };
      break;
    case ApprovalMode.AUTO_EDIT:
      modeBleedThrough = { text: 'auto edit', color: theme.status.warning };
      break;
    case ApprovalMode.DEFAULT:
      modeBleedThrough = null;
      break;
    default:
      checkExhaustive(showApprovalModeIndicator);
      modeBleedThrough = null;
      break;
  }

  const hideMinimalModeHintWhileBusy =
    !showUiDetails && (showLoadingIndicator || hasPendingActionRequired);

  // Universal Content Objects
  const modeContentObj = hideMinimalModeHintWhileBusy ? null : modeBleedThrough;

  const isInteractiveShellWaiting = uiState.currentLoadingPhrase?.includes(
    INTERACTIVE_SHELL_WAITING_PHRASE,
  );

  const estimatedStatusLength = estimateStatusWidth(
    uiState.activeHooks,
    showLoadingIndicator,
    uiState.thought,
    uiState.currentWittyPhrase,
    showWit,
    Boolean(isInteractiveShellWaiting),
  );

  /**
   * Determine the ambient text (tip) to display.
   */
  const tipContentStr = (() => {
    // 1. Proactive Tip (Priority)
    if (
      showTips &&
      uiState.currentTip &&
      !(
        isInteractiveShellWaiting &&
        uiState.currentTip === INTERACTIVE_SHELL_WAITING_PHRASE
      )
    ) {
      if (
        estimatedStatusLength +
          getCachedStringWidth(uiState.currentTip) +
          STATUS_TIP_MIN_GAP <=
        terminalWidth
      ) {
        return uiState.currentTip;
      }
    }

    // 2. Shortcut Hint (Fallback)
    if (
      settings.merged.ui.showShortcutsHint &&
      !hideUiDetailsForSuggestions &&
      !hasPendingActionRequired &&
      uiState.buffer.text.length === 0
    ) {
      return showUiDetails ? '? for shortcuts' : 'press tab twice for more';
    }

    return undefined;
  })();

  const tipLength = tipContentStr ? getCachedStringWidth(tipContentStr) : 0;
  const willCollideTip =
    estimatedStatusLength + tipLength + TIP_COLLISION_BUFFER > terminalWidth;

  const showTipLine = Boolean(
    !hasPendingActionRequired && tipContentStr && !willCollideTip && !isNarrow,
  );

  // Mini Mode VIP Flags (Pure Content Triggers)
  const showMinimalToast = hasToast;

  return (
    <Box
      flexDirection="column"
      width={uiState.terminalWidth}
      flexGrow={0}
      flexShrink={0}
    >
      {(!uiState.slashCommands ||
        !uiState.isConfigInitialized ||
        uiState.isResuming) && (
        <ConfigInitDisplay
          message={uiState.isResuming ? 'Resuming session...' : undefined}
        />
      )}

      {showUiDetails && (
        <QueuedMessageDisplay messageQueue={uiState.messageQueue} />
      )}

      {showUiDetails && <TodoTray />}

      {showShortcutsHelp && <ShortcutsHelp />}

      {(showUiDetails || showMinimalToast) && (
        <Box minHeight={1} marginLeft={isNarrow ? 0 : 1}>
          <ToastDisplay />
        </Box>
      )}

      <Box width="100%" flexDirection="column">
        <StatusRow
          showUiDetails={showUiDetails}
          isNarrow={isNarrow}
          terminalWidth={terminalWidth}
          showTips={showTips}
          showWit={showWit}
          tipContentStr={tipContentStr}
          showTipLine={showTipLine}
          estimatedStatusLength={estimatedStatusLength}
          hideContextSummary={hideContextSummary}
          modeContentObj={modeContentObj}
          hideUiDetailsForSuggestions={hideUiDetailsForSuggestions}
        />
      </Box>

      {showUiDetails && uiState.showErrorDetails && (
        <OverflowProvider>
          <Box flexDirection="column">
            <DetailedMessagesDisplay
              maxHeight={
                uiState.constrainHeight ? debugConsoleMaxHeight : undefined
              }
              width={uiState.terminalWidth}
              hasFocus={uiState.showErrorDetails}
            />
            <ShowMoreLines constrainHeight={uiState.constrainHeight} />
          </Box>
        </OverflowProvider>
      )}

      {uiState.isInputActive && (
        <InputPrompt
          buffer={uiState.buffer}
          inputWidth={uiState.inputWidth}
          suggestionsWidth={uiState.suggestionsWidth}
          onSubmit={uiActions.handleFinalSubmit}
          userMessages={uiState.userMessages}
          setBannerVisible={uiActions.setBannerVisible}
          onClearScreen={uiActions.handleClearScreen}
          config={config}
          slashCommands={uiState.slashCommands || []}
          commandContext={uiState.commandContext}
          shellModeActive={uiState.shellModeActive}
          setShellModeActive={uiActions.setShellModeActive}
          approvalMode={showApprovalModeIndicator}
          onEscapePromptChange={uiActions.onEscapePromptChange}
          focus={isFocused}
          vimHandleInput={uiActions.vimHandleInput}
          isEmbeddedShellFocused={uiState.embeddedShellFocused}
          popAllMessages={uiActions.popAllMessages}
          placeholder={
            vimEnabled
              ? vimMode === 'INSERT'
                ? "  Press 'Esc' for NORMAL mode."
                : "  Press 'i' for INSERT mode."
              : uiState.shellModeActive
                ? '  Type your shell command'
                : '  Type your message or @path/to/file'
          }
          setQueueErrorMessage={uiActions.setQueueErrorMessage}
          streamingState={uiState.streamingState}
          suggestionsPosition={suggestionsPosition}
          onSuggestionsVisibilityChange={setSuggestionsVisible}
        />
      )}

      {showUiDetails &&
        !settings.merged.ui.hideFooter &&
        !isScreenReaderEnabled && <Footer />}
    </Box>
  );
};
