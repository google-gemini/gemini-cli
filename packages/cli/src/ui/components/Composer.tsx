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
import { Box, Text, useIsScreenReaderEnabled } from 'ink';
import { useState, useEffect, useMemo } from 'react';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useVimMode } from '../contexts/VimModeContext.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';
import { isContextUsageHigh } from '../utils/contextUsage.js';
import { theme } from '../semantic-colors.js';
import { GENERIC_WORKING_LABEL } from '../textConstants.js';
import { INTERACTIVE_SHELL_WAITING_PHRASE } from '../hooks/usePhraseCycler.js';
import { StreamingState, type HistoryItemToolGroup } from '../types.js';
import { LoadingIndicator } from './LoadingIndicator.js';
import { StatusDisplay } from './StatusDisplay.js';
import { ToastDisplay, shouldShowToast } from './ToastDisplay.js';
import { ApprovalModeIndicator } from './ApprovalModeIndicator.js';
import { ShellModeIndicator } from './ShellModeIndicator.js';
import { DetailedMessagesDisplay } from './DetailedMessagesDisplay.js';
import { RawMarkdownIndicator } from './RawMarkdownIndicator.js';
import { ShortcutsHelp } from './ShortcutsHelp.js';
import { InputPrompt } from './InputPrompt.js';
import { Footer } from './Footer.js';
import { ShowMoreLines } from './ShowMoreLines.js';
import { QueuedMessageDisplay } from './QueuedMessageDisplay.js';
import { OverflowProvider } from '../contexts/OverflowContext.js';
import { GeminiRespondingSpinner } from './GeminiRespondingSpinner.js';
import { HookStatusDisplay } from './HookStatusDisplay.js';
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
  const { showApprovalModeIndicator } = uiState;
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
    (settings.merged.ui as Record<string, unknown>)[
      'collapseDrawerDuringApproval'
    ] !== false;

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
  const showApprovalIndicator =
    !uiState.shellModeActive && !hideUiDetailsForSuggestions;
  const showRawMarkdownIndicator = !uiState.renderMarkdown;

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

  const USER_HOOK_SOURCES = ['user', 'project', 'runtime'];
  const userHooks = uiState.activeHooks.filter(
    (h) => !h.source || USER_HOOK_SOURCES.includes(h.source),
  );
  const hasUserHooks =
    userHooks.length > 0 && settings.merged.hooksConfig.notifications;

  const shouldReserveSpaceForShortcutsHint =
    settings.merged.ui.showShortcutsHint && !hideUiDetailsForSuggestions;

  const showMinimalContextBleedThrough =
    !settings.merged.ui.footer.hideContextPercentage &&
    isContextUsageHigh(
      uiState.sessionStats.lastPromptTokenCount,
      typeof uiState.currentModel === 'string'
        ? uiState.currentModel
        : undefined,
    );

  /**
   * Calculate the estimated length of the status message to avoid collisions
   * with the tips area.
   */
  let estimatedStatusLength = 0;
  if (hasUserHooks) {
    const hookLabel =
      userHooks.length > 1 ? 'Executing Hooks' : 'Executing Hook';
    const hookNames = userHooks
      .map(
        (h) =>
          h.name +
          (h.index && h.total && h.total > 1 ? ` (${h.index}/${h.total})` : ''),
      )
      .join(', ');
    estimatedStatusLength = hookLabel.length + hookNames.length + 10;
  } else if (showLoadingIndicator) {
    const thoughtText = uiState.thought?.subject || GENERIC_WORKING_LABEL;
    const inlineWittyLength =
      showWit && uiState.currentWittyPhrase
        ? uiState.currentWittyPhrase.length + 1
        : 0;
    estimatedStatusLength = thoughtText.length + 25 + inlineWittyLength;
  } else if (hasPendingActionRequired) {
    estimatedStatusLength = 20;
  } else if (hasToast) {
    estimatedStatusLength = 40;
  }

  /**
   * Determine the ambient text (tip) to display.
   */
  const ambientContentStr = (() => {
    // 1. Proactive Tip (Priority)
    if (showTips && uiState.currentTip) {
      if (
        estimatedStatusLength + uiState.currentTip.length + 10 <=
        terminalWidth
      ) {
        return uiState.currentTip;
      }
    }

    // 2. Shortcut Hint (Fallback)
    if (
      settings.merged.ui.showShortcutsHint &&
      !hideUiDetailsForSuggestions &&
      !hasPendingActionRequired
    ) {
      return showUiDetails ? '? for shortcuts' : 'press tab twice for more';
    }

    return undefined;
  })();

  const estimatedAmbientLength = ambientContentStr?.length || 0;
  const willCollideAmbient =
    estimatedStatusLength + estimatedAmbientLength + 5 > terminalWidth;

  const showAmbientLine =
    !hasPendingActionRequired &&
    ambientContentStr &&
    !willCollideAmbient &&
    !isNarrow;

  // Mini Mode VIP Flags (Pure Content Triggers)
  const miniMode_ShowApprovalMode =
    Boolean(modeContentObj) && !hideUiDetailsForSuggestions;
  const miniMode_ShowToast = hasToast;
  const miniMode_ShowContext = showMinimalContextBleedThrough;
  const miniMode_ShowShortcuts = shouldReserveSpaceForShortcutsHint;
  const miniMode_ShowStatus = showLoadingIndicator || hasUserHooks;
  const miniMode_ShowAmbient = showAmbientLine;

  // Composite Mini Mode Triggers
  const showRow1_MiniMode =
    miniMode_ShowToast ||
    miniMode_ShowStatus ||
    miniMode_ShowShortcuts ||
    miniMode_ShowAmbient;

  const showRow2_MiniMode = miniMode_ShowApprovalMode || miniMode_ShowContext;

  // Final Display Rules (Stable Footer Architecture)
  const showRow1 = showUiDetails || showRow1_MiniMode;
  const showRow2 = showUiDetails || showRow2_MiniMode;

  const showMinimalInlineLoading = !showUiDetails && showLoadingIndicator;
  const showMinimalBleedThroughRow = !showUiDetails && showRow2_MiniMode;

  const isInteractiveShellWaiting = uiState.currentLoadingPhrase?.includes(
    INTERACTIVE_SHELL_WAITING_PHRASE,
  );

  const renderAmbientNode = () => {
    if (!ambientContentStr) return null;

    const isShortcutHint =
      ambientContentStr === '? for shortcuts' ||
      ambientContentStr === 'press tab twice for more';
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
            !isShortcutHint && ambientContentStr === uiState.currentWittyPhrase
          }
        >
          {ambientContentStr === uiState.currentTip
            ? `Tip: ${ambientContentStr}`
            : ambientContentStr}
        </Text>
      </Box>
    );
  };

  const renderStatusNode = () => {
    if (hasUserHooks) {
      const activeHook = userHooks[0];
      const hookIcon = activeHook?.eventName?.startsWith('After') ? '↩' : '↪';

      return (
        <Box flexDirection="row" alignItems="center">
          <Box marginRight={1}>
            <GeminiRespondingSpinner
              nonRespondingDisplay={hookIcon}
              isHookActive={true}
            />
          </Box>
          <Text color={theme.text.primary} italic wrap="truncate-end">
            <HookStatusDisplay activeHooks={userHooks} />
          </Text>
          {showWit && uiState.currentWittyPhrase && (
            <Box marginLeft={1}>
              <Text color={theme.text.secondary} dimColor italic>
                {uiState.currentWittyPhrase} :)
              </Text>
            </Box>
          )}
        </Box>
      );
    }

    if (showLoadingIndicator) {
      return (
        <LoadingIndicator
          inline
          loadingPhrases={loadingPhrases}
          errorVerbosity={settings.merged.ui.errorVerbosity}
          thought={uiState.thought}
          elapsedTime={uiState.elapsedTime}
          forceRealStatusOnly={false}
          wittyPhrase={uiState.currentWittyPhrase}
        />
      );
    }
    return null;
  };

  const statusNode = renderStatusNode();

  /**
   * Renders the minimal metadata row content shown when UI details are hidden.
   */
  const renderMinimalMetaRowContent = () => (
    <Box flexDirection="row">
      {showMinimalInlineLoading && (
        <LoadingIndicator
          inline
          loadingPhrases={loadingPhrases}
          errorVerbosity={settings.merged.ui.errorVerbosity}
          elapsedTime={uiState.elapsedTime}
          forceRealStatusOnly={true}
        />
      )}
      {hasUserHooks && (
        <Box marginLeft={showMinimalInlineLoading ? 1 : 0}>
          <Box marginRight={1}>
            <GeminiRespondingSpinner isHookActive={true} />
          </Box>
          <Text color={theme.text.primary} italic>
            <HookStatusDisplay activeHooks={userHooks} />
          </Text>
        </Box>
      )}
      {showMinimalBleedThroughRow && (
        <Box marginLeft={showMinimalInlineLoading || hasUserHooks ? 1 : 0}>
          {miniMode_ShowApprovalMode && modeContentObj && (
            <Text color={modeContentObj.color}>● {modeContentObj.text}</Text>
          )}
          {/* {zenMode_ShowToast && (
            <Box
              marginLeft={
                showMinimalInlineLoading ||
                zenMode_ShowApprovalMode ||
                hasUserHooks
                  ? 1
                  : 0
              }
            >
              <ToastDisplay />
            </Box>
          )} */}
        </Box>
      )}
    </Box>
  );

  const renderStatusRow = () => {
    // Mini Mode Height Reservation (The "Anti-Jitter" line)
    if (!showUiDetails && !showRow1_MiniMode && !showRow2_MiniMode) {
      return <Box height={1} />;
    }

    return (
      <Box flexDirection="column" width="100%">
        {/* Row 1: multipurpose status (thinking, hooks, wit, tips) */}
        {showRow1 && (
          <Box
            width="100%"
            flexDirection="row"
            alignItems="center"
            justifyContent="space-between"
            minHeight={1}
          >
            <Box flexDirection="row" flexGrow={1} flexShrink={1}>
              {!showUiDetails && miniMode_ShowStatus ? (
                renderMinimalMetaRowContent()
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
              {!isNarrow && showAmbientLine && renderAmbientNode()}
            </Box>
          </Box>
        )}

        {/* Internal Separator Line */}
        {showRow1 &&
          showRow2 &&
          (showUiDetails || (showRow1_MiniMode && showRow2_MiniMode)) && (
            <Box width="100%">
              <Box
                borderStyle="single"
                borderTop
                borderBottom={false}
                borderLeft={false}
                borderRight={false}
                borderColor={theme.border.default}
                borderDimColor={true}
                width="100%"
                height={1}
              />
            </Box>
          )}

        {/* Row 2: Mode and Context Summary */}
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
                  {showApprovalIndicator && (
                    <ApprovalModeIndicator
                      approvalMode={showApprovalModeIndicator}
                      allowPlanMode={uiState.allowPlanMode}
                    />
                  )}
                  {uiState.shellModeActive && (
                    <Box
                      marginLeft={showApprovalIndicator && !isNarrow ? 1 : 0}
                      marginTop={showApprovalIndicator && isNarrow ? 1 : 0}
                    >
                      <ShellModeIndicator />
                    </Box>
                  )}
                  {showRawMarkdownIndicator && (
                    <Box
                      marginLeft={
                        (showApprovalIndicator || uiState.shellModeActive) &&
                        !isNarrow
                          ? 1
                          : 0
                      }
                      marginTop={
                        (showApprovalIndicator || uiState.shellModeActive) &&
                        isNarrow
                          ? 1
                          : 0
                      }
                    >
                      <RawMarkdownIndicator />
                    </Box>
                  )}
                </>
              ) : (
                miniMode_ShowApprovalMode &&
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
              {(showUiDetails || miniMode_ShowContext) && (
                <StatusDisplay hideContextSummary={hideContextSummary} />
              )}
            </Box>
          </Box>
        )}
      </Box>
    );
  };

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

      {(showUiDetails || miniMode_ShowToast) && (
        <Box minHeight={1} marginLeft={isNarrow ? 0 : 1}>
          <ToastDisplay />
        </Box>
      )}

      <Box width="100%" flexDirection="column">
        {renderStatusRow()}
      </Box>

      {showUiDetails && uiState.showErrorDetails && (
        <OverflowProvider>
          <Box flexDirection="column">
            <DetailedMessagesDisplay
              messages={uiState.filteredConsoleMessages}
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
