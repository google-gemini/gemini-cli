/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { Box, Text, useIsScreenReaderEnabled } from 'ink';
import {
  ApprovalMode,
  checkExhaustive,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';
import { LoadingIndicator } from './LoadingIndicator.js';
import { GeminiRespondingSpinner } from './GeminiRespondingSpinner.js';
import { StatusDisplay } from './StatusDisplay.js';
import { HookStatusDisplay } from './HookStatusDisplay.js';
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
import { isNarrowWidth } from '../utils/isNarrowWidth.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useVimMode } from '../contexts/VimModeContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { StreamingState, type HistoryItemToolGroup } from '../types.js';
import { ConfigInitDisplay } from '../components/ConfigInitDisplay.js';
import { TodoTray } from './messages/Todo.js';
import { getInlineThinkingMode } from '../utils/inlineThinkingMode.js';
import { isContextUsageHigh } from '../utils/contextUsage.js';
import { theme } from '../semantic-colors.js';

export const Composer = ({ isFocused = true }: { isFocused?: boolean }) => {
  const config = useConfig();
  const settings = useSettings();
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const uiState = useUIState();
  const uiActions = useUIActions();
  const { vimEnabled, vimMode } = useVimMode();
  const inlineThinkingMode = getInlineThinkingMode(settings);
  const terminalWidth = uiState.terminalWidth;
  const isNarrow = isNarrowWidth(terminalWidth);
  const debugConsoleMaxHeight = Math.floor(Math.max(terminalWidth * 0.2, 5));
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);

  const isAlternateBuffer = useAlternateBuffer();
  const { showApprovalModeIndicator } = uiState;
  const newLayoutSetting = settings.merged.ui.newFooterLayout;
  const isExperimentalLayout = newLayoutSetting !== 'legacy';
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
  const isInteractiveShellWaiting =
    uiState.currentLoadingPhrase?.includes('Tab to focus');
  const hasToast = shouldShowToast(uiState) || isInteractiveShellWaiting;
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
  const isModelIdle = uiState.streamingState === StreamingState.Idle;
  const isBufferEmpty = uiState.buffer.text.length === 0;
  const canShowShortcutsHint =
    isModelIdle && isBufferEmpty && !hasPendingActionRequired;
  const [showShortcutsHintDebounced, setShowShortcutsHintDebounced] =
    useState(canShowShortcutsHint);

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

  const showShortcutsHint =
    settings.merged.ui.showShortcutsHint &&
    !hideShortcutsHintForSuggestions &&
    showShortcutsHintDebounced;
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
      showShortcutsHint);

  const ambientText = isInteractiveShellWaiting
    ? undefined
    : uiState.currentLoadingPhrase;

  // Wit often ends with an ellipsis or similar, tips usually don't.
  const isAmbientTip =
    ambientText &&
    !ambientText.includes('…') &&
    !ambientText.includes('...') &&
    !ambientText.includes('feeling lucky');
  const ambientPrefix = isAmbientTip ? 'Tip: ' : '';

  let estimatedStatusLength = 0;
  if (
    isExperimentalLayout &&
    uiState.activeHooks.length > 0 &&
    settings.merged.hooksConfig.notifications
  ) {
    const hookLabel =
      uiState.activeHooks.length > 1 ? 'Executing Hooks' : 'Executing Hook';
    const hookNames = uiState.activeHooks
      .map(
        (h) =>
          h.name +
          (h.index && h.total && h.total > 1 ? ` (${h.index}/${h.total})` : ''),
      )
      .join(', ');
    estimatedStatusLength = hookLabel.length + hookNames.length + 10; // +10 for spinner and spacing
  } else if (showLoadingIndicator) {
    const thoughtText = uiState.thought?.subject || 'Waiting for model...';
    estimatedStatusLength = thoughtText.length + 25; // Spinner(3) + timer(15) + padding
  } else if (hasPendingActionRequired) {
    estimatedStatusLength = 35; // "⏸ Awaiting user approval..."
  }

  const estimatedAmbientLength =
    ambientPrefix.length + (ambientText?.length || 0);
  const willCollideAmbient =
    estimatedStatusLength + estimatedAmbientLength + 5 > terminalWidth;
  const willCollideShortcuts = estimatedStatusLength + 45 > terminalWidth; // Assume worst-case shortcut hint is 45 chars

  const showAmbientLine =
    showUiDetails &&
    isExperimentalLayout &&
    uiState.streamingState !== StreamingState.Idle &&
    !hasPendingActionRequired &&
    ambientText &&
    !willCollideAmbient &&
    !isNarrow;

  const renderAmbientNode = () => {
    if (isNarrow) return null; // Status should wrap and tips/wit disappear on narrow windows

    if (!showAmbientLine) {
      if (willCollideShortcuts) return null; // If even the shortcut hint would collide, hide completely so Status takes absolute precedent
      return (
        <Box flexDirection="row" justifyContent="flex-end" marginLeft={1}>
          {isExperimentalLayout ? (
            <ShortcutsHint />
          ) : (
            showShortcutsHint && <ShortcutsHint />
          )}
        </Box>
      );
    }
    return (
      <Box flexDirection="row" justifyContent="flex-end" marginLeft={1}>
        <Text color={theme.text.secondary} wrap="truncate-end">
          {ambientPrefix}
          {ambientText}
        </Text>
      </Box>
    );
  };

  const renderStatusNode = () => {
    if (!showUiDetails) return null;

    if (
      isExperimentalLayout &&
      uiState.activeHooks.length > 0 &&
      settings.merged.hooksConfig.notifications
    ) {
      const activeHook = uiState.activeHooks[0];
      const hookIcon = activeHook?.eventName?.startsWith('After') ? '↩' : '↪';

      return (
        <Box flexDirection="row" alignItems="center">
          <Box marginRight={1}>
            <GeminiRespondingSpinner nonRespondingDisplay={hookIcon} />
          </Box>
          <Text color={theme.text.primary} italic wrap="truncate-end">
            <HookStatusDisplay activeHooks={uiState.activeHooks} />
          </Text>
        </Box>
      );
    }

    if (showLoadingIndicator) {
      return (
        <LoadingIndicator
          inline
          thought={
            uiState.streamingState === StreamingState.WaitingForConfirmation
              ? undefined
              : uiState.thought
          }
          currentLoadingPhrase={
            uiState.currentLoadingPhrase?.includes('press tab to focus shell')
              ? uiState.currentLoadingPhrase
              : !isExperimentalLayout &&
                  settings.merged.ui.loadingPhrases !== 'off'
                ? uiState.currentLoadingPhrase
                : isExperimentalLayout &&
                    uiState.streamingState === StreamingState.Responding &&
                    !uiState.thought
                  ? 'Waiting for model...'
                  : undefined
          }
          thoughtLabel={
            !isExperimentalLayout && inlineThinkingMode === 'full'
              ? 'Thinking ...'
              : undefined
          }
          elapsedTime={uiState.elapsedTime}
          forceRealStatusOnly={isExperimentalLayout}
          showCancelAndTimer={!isExperimentalLayout}
        />
      );
    }
    if (hasPendingActionRequired) {
      return (
        <Text color={theme.status.warning}>⏸ Awaiting user approval...</Text>
      );
    }
    return null;
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
        {!isExperimentalLayout ? (
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
                    thought={
                      uiState.streamingState ===
                      StreamingState.WaitingForConfirmation
                        ? undefined
                        : uiState.thought
                    }
                    currentLoadingPhrase={
                      settings.merged.ui.loadingPhrases === 'off'
                        ? undefined
                        : uiState.currentLoadingPhrase
                    }
                    thoughtLabel={
                      inlineThinkingMode === 'full' ? 'Thinking ...' : undefined
                    }
                    elapsedTime={uiState.elapsedTime}
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
                      thought={
                        uiState.streamingState ===
                        StreamingState.WaitingForConfirmation
                          ? undefined
                          : uiState.thought
                      }
                      currentLoadingPhrase={
                        settings.merged.ui.loadingPhrases === 'off'
                          ? undefined
                          : uiState.currentLoadingPhrase
                      }
                      thoughtLabel={
                        inlineThinkingMode === 'full'
                          ? 'Thinking ...'
                          : undefined
                      }
                      elapsedTime={uiState.elapsedTime}
                    />
                  )}
                  {showMinimalModeBleedThrough && minimalModeBleedThrough && (
                    <Text color={minimalModeBleedThrough.color}>
                      ● {minimalModeBleedThrough.text}
                    </Text>
                  )}
                  {hasMinimalStatusBleedThrough && (
                    <Box
                      marginLeft={
                        showMinimalInlineLoading || showMinimalModeBleedThrough
                          ? 1
                          : 0
                      }
                    >
                      <ToastDisplay />
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
            {showUiDetails && <HorizontalLine />}
            {showUiDetails && (
              <Box
                justifyContent={
                  settings.merged.ui.hideContextSummary
                    ? 'flex-start'
                    : 'space-between'
                }
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
                  {hasToast ? (
                    <ToastDisplay />
                  ) : (
                    <Box
                      flexDirection={isNarrow ? 'column' : 'row'}
                      alignItems={isNarrow ? 'flex-start' : 'center'}
                    >
                      {showApprovalIndicator && (
                        <ApprovalModeIndicator
                          approvalMode={showApprovalModeIndicator}
                          allowPlanMode={uiState.allowPlanMode}
                        />
                      )}
                      {!showLoadingIndicator && (
                        <>
                          {uiState.shellModeActive && (
                            <Box
                              marginLeft={
                                showApprovalIndicator && !isNarrow ? 1 : 0
                              }
                              marginTop={
                                showApprovalIndicator && isNarrow ? 1 : 0
                              }
                            >
                              <ShellModeIndicator />
                            </Box>
                          )}
                          {showRawMarkdownIndicator && (
                            <Box
                              marginLeft={
                                (showApprovalIndicator ||
                                  uiState.shellModeActive) &&
                                !isNarrow
                                  ? 1
                                  : 0
                              }
                              marginTop={
                                (showApprovalIndicator ||
                                  uiState.shellModeActive) &&
                                isNarrow
                                  ? 1
                                  : 0
                              }
                            >
                              <RawMarkdownIndicator />
                            </Box>
                          )}
                        </>
                      )}
                    </Box>
                  )}
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
          </Box>
        ) : (
          <Box width="100%" flexDirection="column">
            {showUiDetails && newLayoutSetting === 'new' && <HorizontalLine />}

            {showUiDetails && (
              <Box
                width="100%"
                flexDirection="row"
                alignItems="center"
                justifyContent="space-between"
              >
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
                  <>
                    <Box
                      flexDirection="row"
                      alignItems={isNarrow ? 'flex-start' : 'center'}
                      flexGrow={1}
                      flexShrink={0}
                      marginLeft={1}
                    >
                      {renderStatusNode()}
                    </Box>
                    <Box flexShrink={0} marginLeft={2}>
                      {renderAmbientNode()}
                    </Box>
                  </>
                )}
              </Box>
            )}

            {showUiDetails && newLayoutSetting === 'new_divider_down' && (
              <HorizontalLine />
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
          disabled={hasPendingActionRequired}
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
