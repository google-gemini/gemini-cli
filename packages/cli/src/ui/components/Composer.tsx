/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ApprovalMode,
  checkExhaustive,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';
import { Box, Text, useIsScreenReaderEnabled } from 'ink';
import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useVimMode } from '../contexts/VimModeContext.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';
import { getInlineThinkingMode } from '../utils/inlineThinkingMode.js';
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
import { ShortcutsHint } from './ShortcutsHint.js';
import { ShortcutsHelp } from './ShortcutsHelp.js';
import { InputPrompt } from './InputPrompt.js';
import { Footer } from './Footer.js';
import { ShowMoreLines } from './ShowMoreLines.js';
import { QueuedMessageDisplay } from './QueuedMessageDisplay.js';
import { ContextUsageDisplay } from './ContextUsageDisplay.js';
import { HorizontalLine } from './shared/HorizontalLine.js';
import { OverflowProvider } from '../contexts/OverflowContext.js';
import { GeminiRespondingSpinner } from './GeminiRespondingSpinner.js';
import { HookStatusDisplay } from './HookStatusDisplay.js';
import { ConfigInitDisplay } from './ConfigInitDisplay.js';
import { TodoTray } from './messages/Todo.js';

interface ComposerProps {
  isFocused: boolean;
}

export const Composer: React.FC<ComposerProps> = ({ isFocused }) => {
  const uiState = useUIState();
  const uiActions = useUIActions();
  const settings = useSettings();
  const config = useConfig();
  const { vimEnabled, vimMode } = useVimMode();
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const { columns: terminalWidth } = useTerminalSize();
  const isNarrow = isNarrowWidth(terminalWidth);
  const inlineThinkingMode = getInlineThinkingMode(settings);
  const debugConsoleMaxHeight = Math.floor(Math.max(terminalWidth * 0.2, 5));
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);

  const isAlternateBuffer = useAlternateBuffer();
  const { showApprovalModeIndicator } = uiState;
  const loadingPhrases = settings.merged.ui.loadingPhrases;
  const showTips = loadingPhrases === 'tips' || loadingPhrases === 'all';
  const showWit = loadingPhrases === 'witty' || loadingPhrases === 'all';

  // For this PR we are hardcoding the new experimental layout as the default.
  // We allow a hidden setting to override it specifically for existing tests.
  const isExperimentalLayout =
    (settings.merged.ui as Record<string, unknown>)['useLegacyLayout'] !== true;
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

  const [showShortcutsHintDebounced, setShowShortcutsHintDebounced] =
    useState(false);
  const canShowShortcutsHint =
    uiState.isInputActive &&
    uiState.streamingState === StreamingState.Idle &&
    !hasPendingActionRequired &&
    uiState.buffer.text.length === 0;

  useEffect(() => {
    if (!canShowShortcutsHint) {
      setShowShortcutsHintDebounced(false);
      return;
    }

    const timeout = setTimeout(() => {
      setShowShortcutsHintDebounced(true);
    }, 200);

    return () => clearTimeout(timeout);
  }, [canShowShortcutsHint]);

  // Use the setting if provided, otherwise default to true for the new UX.
  // This allows tests to override the collapse behavior.
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
  const minimalModeBleedThrough = hideMinimalModeHintWhileBusy
    ? null
    : modeBleedThrough;
  const hasMinimalStatusBleedThrough = shouldShowToast(uiState);

  const showMinimalContextBleedThrough =
    !settings.merged.ui.footer.hideContextPercentage &&
    isContextUsageHigh(
      uiState.sessionStats.lastPromptTokenCount,
      typeof uiState.currentModel === 'string'
        ? uiState.currentModel
        : undefined,
    );

  const hideShortcutsHintForSuggestions = hideUiDetailsForSuggestions;

  const showShortcutsHint =
    settings.merged.ui.showShortcutsHint &&
    !hideShortcutsHintForSuggestions &&
    showShortcutsHintDebounced;

  const USER_HOOK_SOURCES = ['user', 'project', 'runtime'];
  const userHooks = uiState.activeHooks.filter(
    (h) => !h.source || USER_HOOK_SOURCES.includes(h.source),
  );
  const hasUserHooks =
    userHooks.length > 0 && settings.merged.hooksConfig.notifications;

  const showMinimalModeBleedThrough =
    !hideUiDetailsForSuggestions && Boolean(minimalModeBleedThrough);
  const showMinimalInlineLoading = !showUiDetails && showLoadingIndicator;
  const showMinimalBleedThroughRow =
    !showUiDetails &&
    (showMinimalModeBleedThrough ||
      hasMinimalStatusBleedThrough ||
      showMinimalContextBleedThrough);
  const showMinimalMetaRow =
    !showUiDetails &&
    (showMinimalInlineLoading ||
      showMinimalBleedThroughRow ||
      showShortcutsHint ||
      hasUserHooks);

  let estimatedStatusLength = 0;
  if (isExperimentalLayout && hasUserHooks) {
    const hookLabel =
      userHooks.length > 1 ? 'Executing Hooks' : 'Executing Hook';
    const hookNames = userHooks
      .map(
        (h) =>
          h.name +
          (h.index && h.total && h.total > 1 ? ` (${h.index}/${h.total})` : ''),
      )
      .join(', ');
    estimatedStatusLength = hookLabel.length + hookNames.length + 10; // +10 for spinner and spacing
  } else if (showLoadingIndicator) {
    const thoughtText = uiState.thought?.subject || GENERIC_WORKING_LABEL;
    const inlineWittyLength =
      showWit && uiState.currentWittyPhrase
        ? uiState.currentWittyPhrase.length + 1
        : 0;
    estimatedStatusLength = thoughtText.length + 25 + inlineWittyLength; // Spinner(3) + timer(15) + padding + witty
  } else if (hasPendingActionRequired) {
    estimatedStatusLength = 20; // "↑ Action required"
  }

  const isInteractiveShellWaiting = uiState.currentLoadingPhrase?.includes(
    INTERACTIVE_SHELL_WAITING_PHRASE,
  );

  const ambientText = (() => {
    if (isInteractiveShellWaiting) return undefined;

    // Try Tip first
    if (showTips && uiState.currentTip) {
      if (
        estimatedStatusLength + uiState.currentTip.length + 5 <=
        terminalWidth
      ) {
        return uiState.currentTip;
      }
    }

    // Fallback to Wit
    if (showWit && uiState.currentWittyPhrase) {
      if (
        estimatedStatusLength + uiState.currentWittyPhrase.length + 5 <=
        terminalWidth
      ) {
        return uiState.currentWittyPhrase;
      }
    }

    return undefined;
  })();

  const estimatedAmbientLength = ambientText?.length || 0;
  const willCollideAmbient =
    estimatedStatusLength + estimatedAmbientLength + 5 > terminalWidth;
  const willCollideShortcuts = estimatedStatusLength + 45 > terminalWidth; // Assume worst-case shortcut hint is 45 chars

  const showAmbientLine =
    showUiDetails &&
    isExperimentalLayout &&
    uiState.streamingState !== StreamingState.Idle &&
    !hasPendingActionRequired &&
    (showTips || showWit) &&
    ambientText &&
    !willCollideAmbient &&
    !isNarrow;

  const renderAmbientNode = () => {
    if (isNarrow) return null; // Status should wrap and tips/wit disappear on narrow windows

    if (!showAmbientLine) {
      if (willCollideShortcuts) return null; // If even the shortcut hint would collide, hide completely so Status takes absolute precedent
      return (
        <Box
          flexDirection="row"
          justifyContent="flex-end"
          marginLeft={1}
          marginRight={1}
        >
          <ShortcutsHint />
        </Box>
      );
    }
    return (
      <Box
        flexDirection="row"
        justifyContent="flex-end"
        marginLeft={1}
        marginRight={1}
      >
        <Text
          color={theme.text.secondary}
          wrap="truncate-end"
          italic={ambientText === uiState.currentWittyPhrase}
        >
          {ambientText}
        </Text>
      </Box>
    );
  };

  const renderStatusNode = () => {
    // In experimental layout, hooks take priority
    if (isExperimentalLayout && hasUserHooks) {
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
          thoughtLabel={
            !isExperimentalLayout && inlineThinkingMode === 'full'
              ? 'Thinking ...'
              : undefined
          }
          elapsedTime={uiState.elapsedTime}
          forceRealStatusOnly={isExperimentalLayout}
          showCancelAndTimer={!isExperimentalLayout}
          wittyPhrase={uiState.currentWittyPhrase}
        />
      );
    }
    if (hasPendingActionRequired) {
      return <Text color={theme.status.warning}>↑ Action required</Text>;
    }
    return null;
  };

  const statusNode = renderStatusNode();
  const hasStatusMessage = Boolean(statusNode) || hasToast;

  const renderExperimentalStatusNode = () => {
    if (!showUiDetails && !showMinimalMetaRow) return null;

    return (
      <Box width="100%" flexDirection="column">
        {!showUiDetails && showMinimalMetaRow && (
          <Box
            width="100%"
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Box flexDirection="row">
              {showMinimalInlineLoading && (
                <LoadingIndicator
                  inline
                  loadingPhrases={loadingPhrases}
                  errorVerbosity={settings.merged.ui.errorVerbosity}
                  elapsedTime={uiState.elapsedTime}
                  forceRealStatusOnly={true}
                  showCancelAndTimer={false}
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
                <Box
                  marginLeft={showMinimalInlineLoading || hasUserHooks ? 1 : 0}
                >
                  {showMinimalModeBleedThrough && minimalModeBleedThrough && (
                    <Text color={minimalModeBleedThrough.color}>
                      ● {minimalModeBleedThrough.text}
                    </Text>
                  )}
                  {hasMinimalStatusBleedThrough && (
                    <Box
                      marginLeft={
                        showMinimalInlineLoading ||
                        showMinimalModeBleedThrough ||
                        hasUserHooks
                          ? 1
                          : 0
                      }
                    >
                      <ToastDisplay />
                    </Box>
                  )}
                  {showMinimalContextBleedThrough && (
                    <Box
                      marginLeft={
                        showMinimalInlineLoading ||
                        showMinimalModeBleedThrough ||
                        hasMinimalStatusBleedThrough ||
                        hasUserHooks
                          ? 1
                          : 0
                      }
                    >
                      <ContextUsageDisplay
                        promptTokenCount={
                          uiState.sessionStats.lastPromptTokenCount
                        }
                        model={uiState.currentModel}
                        terminalWidth={uiState.terminalWidth}
                      />
                    </Box>
                  )}
                </Box>
              )}
            </Box>
            {showShortcutsHint && (
              <Box marginLeft={1}>
                <ShortcutsHint />
              </Box>
            )}
          </Box>
        )}

        {showUiDetails && (
          <Box
            width="100%"
            flexDirection="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <Box flexDirection="row" flexGrow={1} flexShrink={1}>
              {hasToast ? (
                <Box width="100%" marginLeft={1}>
                  {isInteractiveShellWaiting && !shouldShowToast(uiState) ? (
                    <Text color={theme.status.warning}>
                      ! Shell awaiting input (Tab to focus)
                    </Text>
                  ) : (
                    <ToastDisplay />
                  )}
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

            {!hasToast && (
              <Box flexShrink={0} marginLeft={2}>
                {renderAmbientNode()}
              </Box>
            )}
          </Box>
        )}

        {showUiDetails && (
          <Box
            width="100%"
            flexDirection={isNarrow ? 'column' : 'row'}
            alignItems={isNarrow ? 'flex-start' : 'center'}
            justifyContent="space-between"
          >
            <Box flexDirection="row" alignItems="center" marginLeft={1}>
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
            </Box>
            <Box
              marginTop={isNarrow ? 1 : 0}
              flexDirection="row"
              alignItems="center"
              marginLeft={isNarrow ? 1 : 0}
            >
              <StatusDisplay hideContextSummary={hideContextSummary} />
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

      <Box width="100%" flexDirection="column">
        {showUiDetails && hasStatusMessage && <HorizontalLine />}
        {isExperimentalLayout ? (
          renderExperimentalStatusNode()
        ) : (
          <Box width="100%" flexDirection="column">
            <Box
              width="100%"
              flexDirection={isNarrow ? 'column' : 'row'}
              alignItems={isNarrow ? 'flex-start' : 'center'}
              justifyContent={isNarrow ? 'flex-start' : 'space-between'}
            >
              <Box
                marginLeft={1}
                marginRight={isNarrow ? 0 : 1}
                flexDirection="row"
                alignItems={isNarrow ? 'flex-start' : 'center'}
                flexGrow={1}
              >
                {showUiDetails && showLoadingIndicator && (
                  <LoadingIndicator
                    inline
                    loadingPhrases={loadingPhrases}
                    errorVerbosity={settings.merged.ui.errorVerbosity}
                    thought={uiState.thought}
                    thoughtLabel={
                      inlineThinkingMode === 'full' ? 'Thinking ...' : undefined
                    }
                    elapsedTime={uiState.elapsedTime}
                    forceRealStatusOnly={false}
                  />
                )}
              </Box>
              <Box
                marginTop={isNarrow ? 1 : 0}
                flexDirection="column"
                alignItems={isNarrow ? 'flex-start' : 'flex-end'}
              >
                {showUiDetails && showShortcutsHint && <ShortcutsHint />}
              </Box>
            </Box>
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
                  {showMinimalInlineLoading && (
                    <LoadingIndicator
                      inline
                      loadingPhrases={loadingPhrases}
                      errorVerbosity={settings.merged.ui.errorVerbosity}
                      elapsedTime={uiState.elapsedTime}
                      forceRealStatusOnly={true}
                      showCancelAndTimer={false}
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
                    <Box
                      marginLeft={
                        showMinimalInlineLoading ||
                        showMinimalModeBleedThrough ||
                        hasUserHooks
                          ? 1
                          : 0
                      }
                    >
                      {showMinimalModeBleedThrough &&
                        minimalModeBleedThrough && (
                          <Text color={minimalModeBleedThrough.color}>
                            ● {minimalModeBleedThrough.text}
                          </Text>
                        )}
                      {hasMinimalStatusBleedThrough && (
                        <Box
                          marginLeft={
                            showMinimalInlineLoading ||
                            showMinimalModeBleedThrough ||
                            hasUserHooks
                              ? 1
                              : 0
                          }
                        >
                          <ToastDisplay />
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>
                {(showMinimalContextBleedThrough || showShortcutsHint) && (
                  <Box
                    marginTop={isNarrow && showMinimalBleedThroughRow ? 1 : 0}
                    flexDirection={isNarrow ? 'column' : 'row'}
                    alignItems={isNarrow ? 'flex-start' : 'flex-end'}
                  >
                    {showMinimalContextBleedThrough && (
                      <ContextUsageDisplay
                        promptTokenCount={
                          uiState.sessionStats.lastPromptTokenCount
                        }
                        model={uiState.currentModel}
                        terminalWidth={uiState.terminalWidth}
                      />
                    )}
                    {showShortcutsHint && (
                      <Box
                        marginLeft={
                          showMinimalContextBleedThrough && !isNarrow ? 1 : 0
                        }
                        marginTop={
                          showMinimalContextBleedThrough && isNarrow ? 1 : 0
                        }
                      >
                        <ShortcutsHint />
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            )}
            {showShortcutsHelp && <ShortcutsHelp />}
            {showUiDetails && (
              <Box
                width="100%"
                flexDirection="row"
                flexWrap="wrap"
                alignItems="center"
                marginLeft={1}
              >
                {hasToast ? (
                  <ToastDisplay />
                ) : (
                  <>
                    <Box
                      flexDirection="row"
                      alignItems="center"
                      flexWrap="wrap"
                    >
                      {showApprovalIndicator && (
                        <ApprovalModeIndicator
                          approvalMode={showApprovalModeIndicator}
                          allowPlanMode={uiState.allowPlanMode}
                        />
                      )}
                      {!showLoadingIndicator && !hasUserHooks && (
                        <>
                          {uiState.shellModeActive && (
                            <Box marginLeft={1}>
                              <ShellModeIndicator />
                            </Box>
                          )}
                          {showRawMarkdownIndicator && (
                            <Box marginLeft={1}>
                              <RawMarkdownIndicator />
                            </Box>
                          )}
                        </>
                      )}
                    </Box>
                    {!showLoadingIndicator && !hasUserHooks && (
                      <>
                        <Box marginLeft={1}>
                          <Text color={theme.text.secondary}>·</Text>
                        </Box>
                        <StatusDisplay
                          hideContextSummary={hideContextSummary}
                        />
                      </>
                    )}
                  </>
                )}
              </Box>
            )}
          </Box>
        )}
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
