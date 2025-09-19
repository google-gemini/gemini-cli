/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useMemo } from 'react';
import { LoadingIndicator } from './LoadingIndicator.js';
import { ContextSummaryDisplay } from './ContextSummaryDisplay.js';
import { AutoAcceptIndicator } from './AutoAcceptIndicator.js';
import { ShellModeIndicator } from './ShellModeIndicator.js';
import { DetailedMessagesDisplay } from './DetailedMessagesDisplay.js';
import { InputPrompt, calculatePromptWidths } from './InputPrompt.js';
import { Footer, type FooterProps } from './Footer.js';
import { ShowMoreLines } from './ShowMoreLines.js';
import { QueuedMessageDisplay } from './QueuedMessageDisplay.js';
import { OverflowProvider } from '../contexts/OverflowContext.js';
import { theme } from '../semantic-colors.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useFocusState } from '../contexts/FocusContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useVimMode } from '../contexts/VimModeContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { ApprovalMode } from '@google/gemini-cli-core';
import { StreamingState } from '../types.js';
import { ConfigInitDisplay } from '../components/ConfigInitDisplay.js';

export const Composer = () => {
  const config = useConfig();
  const settings = useSettings();
  const uiState = useUIState();
  const isFocused = useFocusState();
  const uiActions = useUIActions();
  const { vimEnabled, vimMode } = useVimMode();
  const terminalWidth = process.stdout.columns;
  const isNarrow = isNarrowWidth(terminalWidth);
  const debugConsoleMaxHeight = Math.floor(Math.max(terminalWidth * 0.2, 5));

  const { contextFileNames, showAutoAcceptIndicator } = uiState;

  // Use the container width of InputPrompt for width of DetailedMessagesDisplay
  const { containerWidth } = useMemo(
    () => calculatePromptWidths(uiState.terminalWidth),
    [uiState.terminalWidth],
  );

  // Build footer props from context values
  const footerProps: Omit<FooterProps, 'vimMode'> = {
    model: config.getModel(),
    targetDir: config.getTargetDir(),
    debugMode: config.getDebugMode(),
    branchName: uiState.branchName,
    debugMessage: uiState.debugMessage,
    corgiMode: uiState.corgiMode,
    errorCount: uiState.errorCount,
    showErrorDetails: uiState.showErrorDetails,
    showMemoryUsage:
      config.getDebugMode() || settings.merged.ui?.showMemoryUsage || false,
    promptTokenCount: uiState.sessionStats.lastPromptTokenCount,
    nightly: uiState.nightly,
    isTrustedFolder: uiState.isTrustedFolder,
    hideCWD: settings.merged.ui?.footer?.hideCWD || false,
    hideSandboxStatus: settings.merged.ui?.footer?.hideSandboxStatus || false,
    hideModelInfo: settings.merged.ui?.footer?.hideModelInfo || false,
  };

  return (
    <Box flexDirection="column">
      {!uiState.shellFocused && (
        <LoadingIndicator
          thought={
            uiState.streamingState === StreamingState.WaitingForConfirmation ||
            config.getAccessibility()?.disableLoadingPhrases
              ? undefined
              : uiState.thought
          }
          currentLoadingPhrase={
            config.getAccessibility()?.disableLoadingPhrases
              ? undefined
              : uiState.currentLoadingPhrase
          }
          elapsedTime={uiState.elapsedTime}
        />
      )}

      {!uiState.isConfigInitialized && <ConfigInitDisplay />}

      <QueuedMessageDisplay messageQueue={uiState.messageQueue} />

      <Box
        marginTop={1}
        justifyContent={
          settings.merged.ui?.hideContextSummary
            ? 'flex-start'
            : 'space-between'
        }
        width="100%"
        flexDirection={isNarrow ? 'column' : 'row'}
        alignItems={isNarrow ? 'flex-start' : 'center'}
      >
        <Box marginRight={1}>
          {process.env['GEMINI_SYSTEM_MD'] && (
            <Text color={theme.status.error}>|⌐■_■| </Text>
          )}
          {uiState.ctrlCPressedOnce ? (
            <Text color={theme.status.warning}>
              Press Ctrl+C again to exit.
            </Text>
          ) : uiState.ctrlDPressedOnce ? (
            <Text color={theme.status.warning}>
              Press Ctrl+D again to exit.
            </Text>
          ) : uiState.showEscapePrompt ? (
            <Text color={theme.text.secondary}>Press Esc again to clear.</Text>
          ) : (
            !settings.merged.ui?.hideContextSummary && (
              <ContextSummaryDisplay
                ideContext={uiState.ideContextState}
                geminiMdFileCount={uiState.geminiMdFileCount}
                contextFileNames={contextFileNames}
                mcpServers={config.getMcpServers()}
                blockedMcpServers={config.getBlockedMcpServers()}
                showToolDescriptions={uiState.showToolDescriptions}
              />
            )
          )}
        </Box>
        <Box paddingTop={isNarrow ? 1 : 0}>
          {showAutoAcceptIndicator !== ApprovalMode.DEFAULT &&
            !uiState.shellModeActive && (
              <AutoAcceptIndicator approvalMode={showAutoAcceptIndicator} />
            )}
          {uiState.shellModeActive && <ShellModeIndicator />}
        </Box>
      </Box>

      {uiState.showErrorDetails && (
        <OverflowProvider>
          <Box flexDirection="column">
            <DetailedMessagesDisplay
              messages={uiState.filteredConsoleMessages}
              maxHeight={
                uiState.constrainHeight ? debugConsoleMaxHeight : undefined
              }
              width={containerWidth}
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
          onClearScreen={uiActions.handleClearScreen}
          config={config}
          slashCommands={uiState.slashCommands}
          commandContext={uiState.commandContext}
          shellModeActive={uiState.shellModeActive}
          setShellModeActive={uiActions.setShellModeActive}
          approvalMode={showAutoAcceptIndicator}
          onEscapePromptChange={uiActions.onEscapePromptChange}
          focus={isFocused}
          vimHandleInput={uiActions.vimHandleInput}
          isShellFocused={uiState.shellFocused}
          placeholder={
            vimEnabled
              ? "  Press 'i' for INSERT mode and 'Esc' for NORMAL mode."
              : '  Type your message or @path/to/file'
          }
        />
      )}

      {!settings.merged.ui?.hideFooter && (
        <Footer {...footerProps} vimMode={vimEnabled ? vimMode : undefined} />
      )}
    </Box>
  );
};
