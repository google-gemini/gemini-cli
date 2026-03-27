/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, useIsScreenReaderEnabled, Text } from 'ink';
import { useState, useEffect } from 'react';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useVimMode } from '../contexts/VimModeContext.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';
import { ToastDisplay, shouldShowToast } from './ToastDisplay.js';
import { DetailedMessagesDisplay } from './DetailedMessagesDisplay.js';
import { ShortcutsHelp } from './ShortcutsHelp.js';
import { InputPrompt } from './InputPrompt.js';
import { Footer } from './Footer.js';
import { StatusRow } from './StatusRow.js';
import { ShowMoreLines } from './ShowMoreLines.js';
import { QueuedMessageDisplay } from './QueuedMessageDisplay.js';
import { OverflowProvider } from '../contexts/OverflowContext.js';
import { ConfigInitDisplay } from './ConfigInitDisplay.js';
import { TodoTray } from './messages/Todo.js';
import { useComposerStatus } from '../hooks/useComposerStatus.js';
import { HorizontalLine } from './shared/HorizontalLine.js';
import { theme } from '../semantic-colors.js';

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
  const showUiDetails = uiState.cleanUiDetailsVisible;
  const suggestionsPosition = isAlternateBuffer ? 'above' : 'below';
  const hideContextSummary =
    suggestionsVisible && suggestionsPosition === 'above';

  const { hasPendingActionRequired, shouldCollapseDuringApproval } =
    useComposerStatus();

  const isPassiveShortcutsHelpState =
    uiState.isInputActive &&
    uiState.streamingState === 'idle' &&
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

  const hideUiDetailsForSuggestions =
    suggestionsVisible && suggestionsPosition === 'above';
  const isModelIdle = uiState.streamingState === 'idle';
  const isModelResponding = uiState.streamingState === 'responding';
  const isBufferEmpty = uiState.buffer.text.length === 0;
  const canShowShortcutsHint =
    (isModelIdle || isModelResponding) &&
    isBufferEmpty &&
    !hasPendingActionRequired;

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

  if (hasPendingActionRequired && shouldCollapseDuringApproval) {
    return null;
  }

  const showShortcutsHelp =
    uiState.shortcutsHelpVisible &&
    uiState.streamingState === 'idle' &&
    !hasPendingActionRequired;

  const hasToast = shouldShowToast(uiState);

  const shouldReserveSpaceForShortcutsHint =
    settings.merged.ui.showShortcutsHint &&
    !hideUiDetailsForSuggestions &&
    !hasPendingActionRequired;
  const showShortcutsHint =
    shouldReserveSpaceForShortcutsHint && showShortcutsHintDebounced;

  const loadingPhrases = settings.merged.ui.loadingPhrases;
  const showTips = loadingPhrases === 'tips' || loadingPhrases === 'all';

  /**
   * Determine the ambient text (tip or shortcut hint) to display.
   */
  const ambientContent = (() => {
    if (showTips && uiState.currentTip) {
      return { text: `Tip: ${uiState.currentTip}`, isTip: true };
    }
    if (showShortcutsHint) {
      const text = showUiDetails
        ? '? for shortcuts'
        : 'press tab twice for more';
      return { text, isTip: false };
    }
    return null;
  })();

  const showMinimalToast = hasToast;

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

      <Box width="100%" flexDirection="column">
        {/* Above Divider Zone: Alerts, Tips, and Hints */}
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
            {showUiDetails && hasToast && <ToastDisplay />}
          </Box>
          <Box
            marginTop={isNarrow ? 1 : 0}
            flexDirection="column"
            alignItems={isNarrow ? 'flex-start' : 'flex-end'}
            minHeight={showUiDetails && ambientContent ? 1 : 0}
          >
            {showUiDetails && ambientContent && (
              <Box flexDirection="row" justifyContent="flex-end">
                <Text
                  color={
                    !ambientContent.isTip && uiState.shortcutsHelpVisible
                      ? theme.text.accent
                      : theme.text.secondary
                  }
                  wrap="truncate-end"
                >
                  {ambientContent.text}
                </Text>
              </Box>
            )}
          </Box>
        </Box>

        <StatusRow
          uiState={uiState}
          settings={settings}
          hideContextSummary={hideContextSummary}
          isNarrow={isNarrow}
          ambientContent={ambientContent}
          showUiDetails={showUiDetails}
          showMinimalToast={showMinimalToast}
          hideUiDetailsForSuggestions={hideUiDetailsForSuggestions}
          hasPendingActionRequired={hasPendingActionRequired}
        />

        {showShortcutsHelp && <ShortcutsHelp />}
        {showUiDetails && <HorizontalLine />}
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
        !isScreenReaderEnabled && (
          <Footer copyModeEnabled={uiState.copyModeEnabled} />
        )}
    </Box>
  );
};
