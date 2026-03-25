/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ApprovalMode,
  checkExhaustive,
  CoreToolCallStatus,
  isUserVisibleHook,
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
import { formatDuration } from '../utils/formatters.js';
import { theme } from '../semantic-colors.js';
import { GENERIC_WORKING_LABEL } from '../textConstants.js';
import { INTERACTIVE_SHELL_WAITING_PHRASE } from '../hooks/usePhraseCycler.js';
import { StreamingState, type HistoryItemToolGroup } from '../types.js';
import { getCachedStringWidth } from '../utils/textUtils.js';
import { LoadingIndicator } from './LoadingIndicator.js';
import { ContextUsageDisplay } from './ContextUsageDisplay.js';
import { StatusDisplay } from './StatusDisplay.js';
import { HorizontalLine } from './shared/HorizontalLine.js';
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

  const allHooks = uiState.activeHooks;
  const hasAnyHooks = allHooks.length > 0;
  const userVisibleHooks = allHooks.filter((h) => isUserVisibleHook(h.source));
  const hasUserVisibleHooks = userVisibleHooks.length > 0;

  const hookText = (() => {
    if (!hasAnyHooks) return undefined;

    let computedHookText = GENERIC_WORKING_LABEL;

    if (hasUserVisibleHooks) {
      const label =
        userVisibleHooks.length > 1 ? 'Executing Hooks' : 'Executing Hook';
      const displayNames = userVisibleHooks.map((h) => {
        let name = h.name;
        if (h.index && h.total && h.total > 1) {
          name += ` (${h.index}/${h.total})`;
        }
        return name;
      });
      computedHookText = `${label}: ${displayNames.join(', ')}`;
    }

    return computedHookText;
  })();

  const shouldReserveSpaceForShortcutsHint =
    settings.merged.ui.showShortcutsHint &&
    !hideUiDetailsForSuggestions &&
    !hasPendingActionRequired;

  const isInteractiveShellWaiting = uiState.currentLoadingPhrase?.includes(
    INTERACTIVE_SHELL_WAITING_PHRASE,
  );

  const cancelAndTimerContentStr =
    uiState.streamingState !== StreamingState.WaitingForConfirmation
      ? `(esc to cancel, ${
          uiState.elapsedTime < 60
            ? `${uiState.elapsedTime}s`
            : formatDuration(uiState.elapsedTime * 1000)
        })`
      : '';

  /**
   * Calculate the measured display width of the status row.
   *
   * This is used to decide whether the "tip" line can safely fit without
   * colliding with the status area.
   */
  const statusWidthForTipCollision = (() => {
    const inlineSpinnerCharWidth = hasAnyHooks || showLoadingIndicator ? 1 : 0;
    const spinnerAndPrimaryGapWidth = 1; // LoadingIndicator marginRight={1}
    const cancelSpacerWidth = 1; // LoadingIndicator width={1}
    const wittySpacerWidth = 1; // LoadingIndicator marginLeft={1}
    const interactiveShellFocusSuffix = ' (press tab to focus)';

    if (hasAnyHooks && hookText) {
      const primaryText = hookText;
      const interactiveExtra =
        primaryText === INTERACTIVE_SHELL_WAITING_PHRASE
          ? interactiveShellFocusSuffix
          : '';
      const cancelShown =
        uiState.streamingState !== StreamingState.WaitingForConfirmation;
      const inlineWittyShown =
        showWit &&
        Boolean(uiState.currentWittyPhrase) &&
        primaryText === 'Thinking...';

      return (
        inlineSpinnerCharWidth +
        spinnerAndPrimaryGapWidth +
        getCachedStringWidth(primaryText) +
        getCachedStringWidth(interactiveExtra) +
        (cancelShown
          ? cancelSpacerWidth + getCachedStringWidth(cancelAndTimerContentStr)
          : 0) +
        (inlineWittyShown
          ? wittySpacerWidth + getCachedStringWidth(uiState.currentWittyPhrase!)
          : 0)
      );
    }

    if (showLoadingIndicator) {
      const primaryText =
        uiState.thought?.subject ??
        (uiState.streamingState === StreamingState.Responding
          ? 'Thinking...'
          : undefined);
      const interactiveExtra =
        primaryText === INTERACTIVE_SHELL_WAITING_PHRASE
          ? interactiveShellFocusSuffix
          : '';
      const cancelShown =
        uiState.streamingState !== StreamingState.WaitingForConfirmation;
      const inlineWittyShown =
        showWit &&
        Boolean(uiState.currentWittyPhrase) &&
        primaryText === 'Thinking...';

      return (
        inlineSpinnerCharWidth +
        spinnerAndPrimaryGapWidth +
        getCachedStringWidth(primaryText ?? '') +
        getCachedStringWidth(interactiveExtra) +
        (cancelShown
          ? cancelSpacerWidth + getCachedStringWidth(cancelAndTimerContentStr)
          : 0) +
        (inlineWittyShown
          ? wittySpacerWidth + getCachedStringWidth(uiState.currentWittyPhrase!)
          : 0)
      );
    }

    if (hasPendingActionRequired) return 20;
    if (hasToast) return 40;
    return 0;
  })();

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
        statusWidthForTipCollision +
          getCachedStringWidth(`Tip: ${uiState.currentTip}`) +
          5 <=
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

  const tipDisplayText =
    tipContentStr && tipContentStr === uiState.currentTip
      ? `Tip: ${tipContentStr}`
      : tipContentStr;
  const tipWidth = tipDisplayText ? getCachedStringWidth(tipDisplayText) : 0;
  const willCollideTip =
    statusWidthForTipCollision + tipWidth + 5 > terminalWidth;

  const showTipLine =
    !hasPendingActionRequired && tipContentStr && !willCollideTip && !isNarrow;

  // Mini Mode VIP Flags (Pure Content Triggers)
  const miniModeShowApprovalMode =
    Boolean(modeContentObj) && !hideUiDetailsForSuggestions;
  const miniModeShowToast = hasToast;
  const miniModeShowShortcuts = shouldReserveSpaceForShortcutsHint;
  const miniModeShowStatus = showLoadingIndicator || hasAnyHooks;
  const miniModeShowTip = showTipLine;
  const miniModeShowContext = isContextUsageHigh(
    uiState.sessionStats.lastPromptTokenCount,
    uiState.currentModel,
    settings.merged.model?.compressionThreshold,
  );

  // Composite Mini Mode Triggers
  const showRow1MiniMode =
    miniModeShowToast ||
    miniModeShowStatus ||
    miniModeShowShortcuts ||
    miniModeShowTip;

  const showRow2MiniMode = miniModeShowApprovalMode || miniModeShowContext;

  // Final Display Rules (Stable Footer Architecture)
  const showRow1 = showUiDetails || showRow1MiniMode;
  const showRow2 = showUiDetails || showRow2MiniMode;

  const showMinimalBleedThroughRow = !showUiDetails && showRow2MiniMode;

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

  const renderStatusNode = () => {
    if (!hasAnyHooks && !showLoadingIndicator) return null;

    const commonProps = {
      inline: true,
      showTips,
      showWit,
      errorVerbosity: settings.merged.ui.errorVerbosity,
      elapsedTime: uiState.elapsedTime,
      forceRealStatusOnly: false,
      wittyPhrase: uiState.currentWittyPhrase,
    } as const;

    return hasAnyHooks ? (
      <LoadingIndicator
        {...commonProps}
        currentLoadingPhrase={hookText ?? GENERIC_WORKING_LABEL}
      />
    ) : (
      <LoadingIndicator {...commonProps} thought={uiState.thought} />
    );
  };

  const statusNode = renderStatusNode();

  /**
   * Renders the minimal metadata row content shown when UI details are hidden.
   */
  const renderMinimalMetaRowContent = () => (
    <Box flexDirection="row" columnGap={1}>
      {renderStatusNode()}
      {showMinimalBleedThroughRow && (
        <Box>
          {miniModeShowApprovalMode && modeContentObj && (
            <Text color={modeContentObj.color}>● {modeContentObj.text}</Text>
          )}
        </Box>
      )}
    </Box>
  );

  const StatusRow = () => {
    // Mini Mode Height Reservation (The "Anti-Jitter" line)
    if (!showUiDetails && !showRow1MiniMode && !showRow2MiniMode) {
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
              {!showUiDetails && showRow1MiniMode ? (
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
              {!isNarrow && showTipLine && renderTipNode()}
            </Box>
          </Box>
        )}

        {/* Internal Separator Line */}
        {showRow1 &&
          showRow2 &&
          (showUiDetails || (showRow1MiniMode && showRow2MiniMode)) && (
            <Box width="100%">
              <HorizontalLine dim />
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
                miniModeShowApprovalMode &&
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
              {(showUiDetails || miniModeShowContext) && (
                <StatusDisplay hideContextSummary={hideContextSummary} />
              )}
              {miniModeShowContext && !showUiDetails && (
                <Box marginLeft={1}>
                  <ContextUsageDisplay
                    promptTokenCount={uiState.sessionStats.lastPromptTokenCount}
                    model={
                      typeof uiState.currentModel === 'string'
                        ? uiState.currentModel
                        : undefined
                    }
                    terminalWidth={uiState.terminalWidth}
                  />
                </Box>
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
      {uiState.isResuming && (
        <ConfigInitDisplay message="Resuming session..." />
      )}

      {showUiDetails && (
        <QueuedMessageDisplay messageQueue={uiState.messageQueue} />
      )}

      {showUiDetails && <TodoTray />}

      {showShortcutsHelp && <ShortcutsHelp />}

      {(showUiDetails || miniModeShowToast) && (
        <Box minHeight={1} marginLeft={isNarrow ? 0 : 1}>
          <ToastDisplay />
        </Box>
      )}

      <Box width="100%" flexDirection="column">
        <StatusRow />
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
          copyModeEnabled={uiState.copyModeEnabled}
        />
      )}

      {showUiDetails &&
        !settings.merged.ui.hideFooter &&
        !isScreenReaderEnabled && (
          <Footer copyModeEnabled={uiState.copyModeEnabled} />
        )}
    </Box>
  );
};
