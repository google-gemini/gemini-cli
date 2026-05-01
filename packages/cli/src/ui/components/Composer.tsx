/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, useIsScreenReaderEnabled } from 'ink';
import { useState, useEffect } from 'react';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useInputState } from '../contexts/InputContext.js';
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
import { appEvents, AppEvent } from '../../utils/events.js';

export const Composer = ({ isFocused = true }: { isFocused?: boolean }) => {
  const uiState = useUIState();
  const inputState = useInputState();
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
    if (hasPendingActionRequired) {
      appEvents.emit(AppEvent.ScrollToBottom);
    }
  }, [hasPendingActionRequired]);

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
    uiState.streamingState === 'idle' &&
    !hasPendingActionRequired;

  if (hasPendingActionRequired && shouldCollapseDuringApproval) {
    return null;
  }

  const showToast = shouldShowToast(uiState, inputState);
  const hideUiDetailsForSuggestions =
    suggestionsVisible && suggestionsPosition === 'above';

  // Mini Mode VIP Flags (Pure Content Triggers)
  const showMinimalToast = showToast;

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
          hideContextSummary={hideContextSummary}
          hideUiDetailsForSuggestions={hideUiDetailsForSuggestions}
          hasPendingActionRequired={hasPendingActionRequired}
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
          onSubmit={uiActions.handleFinalSubmit}
          setBannerVisible={uiActions.setBannerVisible}
          onClearScreen={uiActions.handleClearScreen}
          config={config}
          slashCommands={uiState.slashCommands || []}
          commandContext={uiState.commandContext}
          setShellModeActive={uiActions.setShellModeActive}
          approvalMode={uiState.showApprovalModeIndicator}
          onEscapePromptChange={uiActions.onEscapePromptChange}
          focus={isFocused}
          vimHandleInput={uiActions.vimHandleInput}
          isEmbeddedShellFocused={uiState.embeddedShellFocused}
          popAllMessages={uiActions.popAllMessages}
          onQueueMessage={uiActions.addMessage}
          placeholder={
            vimEnabled
              ? vimMode === 'INSERT'
                ? "  Press 'Esc' for NORMAL mode."
                : "  Press 'i' for INSERT mode."
              : inputState.shellModeActive
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
