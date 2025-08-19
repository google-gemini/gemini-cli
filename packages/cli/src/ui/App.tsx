/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Box, DOMElement, measureElement } from 'ink';
import { StreamingState } from './types.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { useAutoAcceptIndicator } from './hooks/useAutoAcceptIndicator.js';
import { LoadedSettings } from '../config/settings.js';
import { HistoryItemDisplay } from './components/HistoryItemDisplay.js';
import {
  type Config,
  getAllGeminiMdFilenames,
} from '@google/gemini-cli-core';
import { StreamingContext } from './contexts/StreamingContext.js';
import { useSessionStats } from './contexts/SessionContext.js';
import { useGitBranchName } from './hooks/useGitBranchName.js';
import { useAppContext } from './contexts/AppContext.js';
import { useVimMode } from './contexts/VimModeContext.js';
import { AppHeader } from './components/AppHeader.js';
import { Notifications } from './components/Notifications.js';
import { MainContent } from './components/MainContent.js';
import { DialogManager } from './components/DialogManager.js';
import { InputArea } from './components/InputArea.js';
import { useUIState } from './contexts/UIStateContext.js';
import { useUIActions } from './contexts/UIActionsContext.js';
import { useConfig } from './contexts/ConfigContext.js';
import { useSettings } from './contexts/SettingsContext.js';

interface AppProps {}

export const App = (props: AppProps) => {
  const { version } = useAppContext();
  const config = useConfig();
  const settings = useSettings();
  const uiState = useUIState();
  const uiActions = useUIActions();

  const { stats: sessionStats } = useSessionStats();
  const { rows: terminalHeight, columns: terminalWidth } = useTerminalSize();
  const { vimEnabled } = useVimMode();
  const branchName = useGitBranchName(config.getTargetDir());
  const showAutoAcceptIndicator = useAutoAcceptIndicator({ config });

  const mainControlsRef = useRef<DOMElement>(null);
  const pendingHistoryItemRef = useRef<DOMElement>(null);

  const staticExtraHeight = 3;
  const availableTerminalHeight = useMemo(() => {
    if (mainControlsRef.current) {
      const fullFooterMeasurement = measureElement(mainControlsRef.current);
      return terminalHeight - fullFooterMeasurement.height - staticExtraHeight;
    }
    return terminalHeight - staticExtraHeight;
  }, [terminalHeight, uiState.isInputActive]); // Re-calculate when input appears/disappears

  const contextFileNames = useMemo(() => {
    const fromSettings = settings.merged.contextFileName;
    return fromSettings
      ? Array.isArray(fromSettings)
        ? fromSettings
        : [fromSettings]
      : getAllGeminiMdFilenames();
  }, [settings.merged.contextFileName]);

  const initialPrompt = useMemo(() => config.getQuestion(), [config]);
  const initialPromptSubmitted = useRef(false);
  const geminiClient = config.getGeminiClient();

  useEffect(() => {
    if (
      initialPrompt &&
      !initialPromptSubmitted.current &&
      !uiState.isAuthenticating &&
      !uiState.isAuthDialogOpen &&
      !uiState.isThemeDialogOpen &&
      !uiState.isEditorDialogOpen &&
      !uiState.showPrivacyNotice &&
      geminiClient?.isInitialized?.()
    ) {
      uiActions.handleFinalSubmit(initialPrompt);
      initialPromptSubmitted.current = true;
    }
  }, [
    initialPrompt,
    uiActions,
    uiState.isAuthenticating,
    uiState.isAuthDialogOpen,
    uiState.isThemeDialogOpen,
    uiState.isEditorDialogOpen,
    uiState.showPrivacyNotice,
    geminiClient,
  ]);

  const errorCount = useMemo(
    () =>
      uiState.filteredConsoleMessages
        .filter((msg) => msg.type === 'error')
        .reduce((total, msg) => total + msg.count, 0),
    [uiState.filteredConsoleMessages],
  );

  if (uiState.quittingMessages) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        {uiState.quittingMessages.map((item) => (
          <HistoryItemDisplay
            key={item.id}
            availableTerminalHeight={
              uiState.constrainHeight ? availableTerminalHeight : undefined
            }
            terminalWidth={terminalWidth}
            item={item}
            isPending={false}
          />
        ))}
      </Box>
    );
  }

  const mainAreaWidth = Math.floor(terminalWidth * 0.9);
  const nightly = version.includes('nightly');
  const pendingHistoryItems = [
    ...uiState.pendingSlashCommandHistoryItems,
    ...uiState.pendingGeminiHistoryItems,
  ];

  const dialogsVisible =
    uiState.shouldShowIdePrompt ||
    uiState.isFolderTrustDialogOpen ||
    !!uiState.shellConfirmationRequest ||
    !!uiState.confirmationRequest ||
    uiState.isThemeDialogOpen ||
    uiState.isSettingsDialogOpen ||
    uiState.isAuthenticating ||
    uiState.isAuthDialogOpen ||
    uiState.isEditorDialogOpen ||
    uiState.showPrivacyNotice;

  return (
    <StreamingContext.Provider value={uiState.streamingState}>
      <Box flexDirection="column" width="90%">
        <MainContent
          pendingHistoryItems={pendingHistoryItems}
          mainAreaWidth={mainAreaWidth}
          staticAreaMaxItemHeight={Math.max(terminalHeight * 4, 100)}
          availableTerminalHeight={availableTerminalHeight}
          pendingHistoryItemRef={pendingHistoryItemRef}
          nightly={nightly}
        />

                <Box flexDirection="column" ref={mainControlsRef}>
          <Notifications />

          {dialogsVisible ? (
            <DialogManager
              constrainHeight={uiState.constrainHeight}
              terminalHeight={terminalHeight}
              staticExtraHeight={staticExtraHeight}
              mainAreaWidth={mainAreaWidth}
            />
          ) : (
            <InputArea
              contextFileNames={contextFileNames}
              showAutoAcceptIndicator={showAutoAcceptIndicator}
              footerProps={{
                model: config.getModel(),
                targetDir: config.getTargetDir(),
                debugMode: config.getDebugMode(),
                branchName: branchName || '',
                debugMessage: uiState.debugMessage,
                corgiMode: uiState.corgiMode,
                errorCount: errorCount,
                showErrorDetails: uiState.showErrorDetails,
                showMemoryUsage:
                  config.getDebugMode() ||
                  settings.merged.showMemoryUsage ||
                  false,
                promptTokenCount: sessionStats.lastPromptTokenCount,
                nightly: nightly,
              }}
            />
          )}
        </Box>
      </Box>
    </StreamingContext.Provider>
  );
};