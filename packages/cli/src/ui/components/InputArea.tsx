/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { LoadingIndicator } from './LoadingIndicator.js';
import { ContextSummaryDisplay } from './ContextSummaryDisplay.js';
import { AutoAcceptIndicator } from './AutoAcceptIndicator.js';
import { ShellModeIndicator } from './ShellModeIndicator.js';
import { DetailedMessagesDisplay } from './DetailedMessagesDisplay.js';
import { InputPrompt } from './InputPrompt.js';
import { Footer, FooterProps } from './Footer.js';
import { ShowMoreLines } from './ShowMoreLines.js';
import { OverflowProvider } from '../contexts/OverflowContext.js';
import { Colors } from '../colors.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useVimMode } from '../contexts/VimModeContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { ApprovalMode } from '@google/gemini-cli-core';
import { StreamingState } from '../types.js';

interface InputAreaProps {
  contextFileNames: string[];
  showAutoAcceptIndicator: ApprovalMode;
  footerProps: Omit<FooterProps, 'vimMode'>;
}

export const InputArea = (props: InputAreaProps) => {
  const { contextFileNames, showAutoAcceptIndicator, footerProps } = props;

  const config = useConfig();

  const uiState = useUIState();
  const uiActions = useUIActions();
  const { vimEnabled, vimMode } = useVimMode();
  const terminalWidth = process.stdout.columns;
  const isNarrow = isNarrowWidth(terminalWidth);
  const debugConsoleMaxHeight = Math.floor(Math.max(terminalWidth * 0.2, 5));

  return (
    <Box flexDirection="column">
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
        elapsedTime={parseInt(uiState.elapsedTime, 10)}
      />

      <Box
        marginTop={1}
        justifyContent="space-between"
        width="100%"
        flexDirection={isNarrow ? 'column' : 'row'}
        alignItems={isNarrow ? 'flex-start' : 'center'}
      >
        <Box>
          {process.env.GEMINI_SYSTEM_MD && (
            <Text color={Colors.AccentRed}>|⌐■_■| </Text>
          )}
          {uiState.ctrlCPressedOnce ? (
            <Text color={Colors.AccentYellow}>Press Ctrl+C again to exit.</Text>
          ) : uiState.ctrlDPressedOnce ? (
            <Text color={Colors.AccentYellow}>Press Ctrl+D again to exit.</Text>
          ) : uiState.showEscapePrompt ? (
            <Text color={Colors.Gray}>Press Esc again to clear.</Text>
          ) : (
            <ContextSummaryDisplay
              ideContext={uiState.ideContextState}
              geminiMdFileCount={uiState.geminiMdFileCount}
              contextFileNames={contextFileNames}
              mcpServers={config.getMcpServers()}
              blockedMcpServers={config.getBlockedMcpServers()}
              showToolDescriptions={uiState.showToolDescriptions}
            />
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
              width={uiState.inputWidth}
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
          onEscapePromptChange={uiActions.onEscapePromptChange}
          focus={uiState.isFocused}
          vimHandleInput={uiActions.vimHandleInput}
          placeholder={
            vimEnabled
              ? "  Press 'i' for INSERT mode and 'Esc' for NORMAL mode."
              : '  Type your message or @path/to/file'
          }
        />
      )}

      {uiState.initError &&
        uiState.streamingState !== StreamingState.Responding && (
          <Box
            borderStyle="round"
            borderColor={Colors.AccentRed}
            paddingX={1}
            marginBottom={1}
          >
            <Text color={Colors.AccentRed}>
              Initialization Error: {uiState.initError}
            </Text>
          </Box>
        )}
      <Footer {...footerProps} vimMode={vimEnabled ? vimMode : undefined} />
    </Box>
  );
};
