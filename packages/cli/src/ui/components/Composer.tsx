/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Box, Text, useIsScreenReaderEnabled } from 'ink';
import { ApprovalMode, tokenLimit } from '@google/gemini-cli-core';
import { LoadingIndicator } from './LoadingIndicator.js';
import { StatusDisplay } from './StatusDisplay.js';
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
import { StreamingState, ToolCallStatus } from '../types.js';
import { ConfigInitDisplay } from '../components/ConfigInitDisplay.js';
import { TodoTray } from './messages/Todo.js';
import { getInlineThinkingMode } from '../utils/inlineThinkingMode.js';
import { theme } from '../semantic-colors.js';
import { TransientMessageType } from '../../utils/events.js';

export const Composer = ({ isFocused = true }: { isFocused?: boolean }) => {
  const config = useConfig();
  const settings = useSettings();
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const uiState = useUIState();
  const uiActions = useUIActions();
  const { vimEnabled, vimMode } = useVimMode();
  const inlineThinkingMode = getInlineThinkingMode(settings);
  const terminalWidth = process.stdout.columns;
  const isNarrow = isNarrowWidth(terminalWidth);
  const debugConsoleMaxHeight = Math.floor(Math.max(terminalWidth * 0.2, 5));
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);

  const isAlternateBuffer = useAlternateBuffer();
  const { showApprovalModeIndicator } = uiState;
  const showUiDetails = uiState.cleanUiDetailsVisible;
  const suggestionsPosition = isAlternateBuffer ? 'above' : 'below';
  const hideContextSummary =
    suggestionsVisible && suggestionsPosition === 'above';
  const hasPendingToolConfirmation = (uiState.pendingHistoryItems ?? []).some(
    (item) =>
      item.type === 'tool_group' &&
      item.tools.some((tool) => tool.status === ToolCallStatus.Confirming),
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
  const showLoadingIndicator =
    (!uiState.embeddedShellFocused || uiState.isBackgroundShellVisible) &&
    uiState.streamingState === StreamingState.Responding &&
    !hasPendingActionRequired;
  const showApprovalIndicator = !uiState.shellModeActive;
  const showRawMarkdownIndicator = !uiState.renderMarkdown;
  const modeBleedThrough =
    showApprovalModeIndicator === ApprovalMode.YOLO
      ? { text: 'YOLO', color: theme.status.error }
      : showApprovalModeIndicator === ApprovalMode.PLAN
        ? { text: 'plan', color: theme.status.success }
        : showApprovalModeIndicator === ApprovalMode.AUTO_EDIT
          ? { text: 'auto edit', color: theme.status.warning }
          : null;
  const hasMinimalStatusBleedThrough =
    uiState.ctrlCPressedOnce ||
    uiState.ctrlDPressedOnce ||
    (uiState.transientMessage?.type === TransientMessageType.Warning &&
      Boolean(uiState.transientMessage.text)) ||
    Boolean(uiState.queueErrorMessage) ||
    (uiState.showEscapePrompt &&
      (uiState.buffer.text.length > 0 || uiState.history.length > 0));
  const contextTokenLimit =
    typeof uiState.currentModel === 'string' && uiState.currentModel.length > 0
      ? tokenLimit(uiState.currentModel)
      : 0;
  const showMinimalContextBleedThrough =
    !settings.merged.ui.footer.hideContextPercentage &&
    typeof uiState.currentModel === 'string' &&
    uiState.currentModel.length > 0 &&
    contextTokenLimit > 0 &&
    uiState.sessionStats.lastPromptTokenCount / contextTokenLimit > 0.6;
  const showMinimalBleedThroughRow =
    !showUiDetails &&
    (Boolean(modeBleedThrough) ||
      hasMinimalStatusBleedThrough ||
      showMinimalContextBleedThrough);

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

      <Box marginTop={1} width="100%" flexDirection="column">
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
            alignItems="center"
            flexGrow={1}
          >
            {showLoadingIndicator && (
              <LoadingIndicator
                inline
                thought={
                  uiState.streamingState ===
                    StreamingState.WaitingForConfirmation ||
                  config.getAccessibility()?.enableLoadingPhrases === false
                    ? undefined
                    : uiState.thought
                }
                currentLoadingPhrase={
                  config.getAccessibility()?.enableLoadingPhrases === false
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
            {!hasPendingActionRequired &&
              (!showUiDetails || !showLoadingIndicator) && <ShortcutsHint />}
          </Box>
        </Box>
        {showMinimalBleedThroughRow && (
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
              {modeBleedThrough && (
                <Text color={modeBleedThrough.color}>
                  {modeBleedThrough.text}
                </Text>
              )}
              {hasMinimalStatusBleedThrough && (
                <Box marginLeft={modeBleedThrough ? 1 : 0}>
                  <StatusDisplay hideContextSummary={true} />
                </Box>
              )}
            </Box>
            {showMinimalContextBleedThrough && (
              <Box
                marginTop={isNarrow ? 1 : 0}
                alignItems={isNarrow ? 'flex-start' : 'flex-end'}
              >
                <ContextUsageDisplay
                  promptTokenCount={uiState.sessionStats.lastPromptTokenCount}
                  model={uiState.currentModel}
                  terminalWidth={uiState.terminalWidth}
                />
              </Box>
            )}
          </Box>
        )}
        {uiState.shortcutsHelpVisible && <ShortcutsHelp />}
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
              {!showLoadingIndicator && (
                <Box
                  flexDirection={isNarrow ? 'column' : 'row'}
                  alignItems={isNarrow ? 'flex-start' : 'center'}
                >
                  {showApprovalIndicator && (
                    <ApprovalModeIndicator
                      approvalMode={showApprovalModeIndicator}
                      isPlanEnabled={config.isPlanEnabled()}
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
