/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  Box,
  DOMElement,
  measureElement,
  Static,
  Text,
  useInput,
  type Key as InkKeyType,
} from 'ink';
import { StreamingState, type HistoryItem, MessageType } from './types.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { useGeminiStream } from './hooks/useGeminiStream.js';
import { useLoadingIndicator } from './hooks/useLoadingIndicator.js';
import { useThemeCommand } from './hooks/useThemeCommand.js';
import { useSlashCommandProcessor } from './hooks/slashCommandProcessor.js';
import { useAutoAcceptIndicator } from './hooks/useAutoAcceptIndicator.js';
import { useConsoleMessages } from './hooks/useConsoleMessages.js';
import { Header } from './components/Header.js';
import { LoadingIndicator } from './components/LoadingIndicator.js';
import { AutoAcceptIndicator } from './components/AutoAcceptIndicator.js';
import { ShellModeIndicator } from './components/ShellModeIndicator.js';
import { InputPrompt } from './components/InputPrompt.js';
import { Footer } from './components/Footer.js';
import { ThemeDialog } from './components/ThemeDialog.js';
import { Colors } from './colors.js';
import { Help } from './components/Help.js';
import { loadHierarchicalGeminiMemory } from '../config/config.js';
import { LoadedSettings } from '../config/settings.js';
import { Tips } from './components/Tips.js';
import { useConsolePatcher } from './components/ConsolePatcher.js';
import { DetailedMessagesDisplay } from './components/DetailedMessagesDisplay.js';
import { HistoryItemDisplay } from './components/HistoryItemDisplay.js';
import { useHistory } from './hooks/useHistoryManager.js';
import process from 'node:process';
import { getErrorMessage, type Config } from '@gemini-code/server';
import { useLogger } from './hooks/useLogger.js';

interface AppProps {
  config: Config;
  settings: LoadedSettings;
  cliVersion: string;
  startupWarnings?: string[];
}

export const App = ({
  config,
  settings,
  cliVersion,
  startupWarnings = [],
}: AppProps) => {
  const { history, addItem, clearItems } = useHistory();
  const {
    consoleMessages,
    handleNewMessage,
    clearConsoleMessages: clearConsoleMessagesState,
  } = useConsoleMessages();
  const [staticNeedsRefresh, setStaticNeedsRefresh] = useState(false);
  const [staticKey, setStaticKey] = useState(0);
  const refreshStatic = useCallback(() => {
    setStaticKey((prev) => prev + 1);
  }, [setStaticKey]);

  const [geminiMdFileCount, setGeminiMdFileCount] = useState<number>(0);
  const [debugMessage, setDebugMessage] = useState<string>('');
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [footerHeight, setFooterHeight] = useState<number>(0);
  const [corgiMode, setCorgiMode] = useState(false);
  const [shellModeActive, setShellModeActive] = useState(false);
  const [showErrorDetails, setShowErrorDetails] = useState<boolean>(false);

  const errorCount = useMemo(
    () => consoleMessages.filter((msg) => msg.type === 'error').length,
    [consoleMessages],
  );
  useInput((input: string, key: InkKeyType) => {
    if (key.ctrl && input === 'o') {
      setShowErrorDetails((prev) => !prev);
      refreshStatic();
    }
  });

  useConsolePatcher({
    onNewMessage: handleNewMessage,
    debugMode: config.getDebugMode(),
  });

  const toggleCorgiMode = useCallback(() => {
    setCorgiMode((prev) => !prev);
  }, []);

  const {
    isThemeDialogOpen,
    openThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
  } = useThemeCommand(settings, setThemeError);

  useEffect(() => {
    if (config) {
      setGeminiMdFileCount(config.getGeminiMdFileCount());
    }
  }, [config]);

  const performMemoryRefresh = useCallback(async () => {
    addItem(
      {
        type: MessageType.INFO,
        text: 'Refreshing hierarchical memory (GEMINI.md files)...',
      },
      Date.now(),
    );
    try {
      const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(
        process.cwd(),
        config.getDebugMode(),
      );
      config.setUserMemory(memoryContent);
      config.setGeminiMdFileCount(fileCount);
      setGeminiMdFileCount(fileCount);

      addItem(
        {
          type: MessageType.INFO,
          text: `Memory refreshed successfully. ${memoryContent.length > 0 ? `Loaded ${memoryContent.length} characters from ${fileCount} file(s).` : 'No memory content found.'}`,
        },
        Date.now(),
      );
      if (config.getDebugMode()) {
        console.log(
          `[DEBUG] Refreshed memory content in config: ${memoryContent.substring(0, 200)}...`,
        );
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      addItem(
        {
          type: MessageType.ERROR,
          text: `Error refreshing memory: ${errorMessage}`,
        },
        Date.now(),
      );
      console.error('Error refreshing memory:', error);
    }
  }, [config, addItem]);

  const { handleSlashCommand, slashCommands } = useSlashCommandProcessor(
    config,
    addItem,
    clearItems,
    refreshStatic,
    setShowHelp,
    setDebugMessage,
    openThemeDialog,
    performMemoryRefresh,
    toggleCorgiMode,
    cliVersion,
  );

  const { streamingState, submitQuery, initError, pendingHistoryItems } =
    useGeminiStream(
      addItem,
      refreshStatic,
      setShowHelp,
      config,
      setDebugMessage,
      handleSlashCommand,
      shellModeActive,
    );
  const isPausedForConfirmation = useMemo(
    () =>
      pendingHistoryItems.some(
        (item) =>
          item?.type === 'tool_group' &&
          item.tools.some((tool) => tool.status === 'Confirming'),
      ),
    [pendingHistoryItems],
  );
  const { elapsedTime, currentLoadingPhrase, shouldShowSpinner } =
    useLoadingIndicator(streamingState, isPausedForConfirmation);
  const showAutoAcceptIndicator = useAutoAcceptIndicator({ config });

  const handleFinalSubmit = useCallback(
    (submittedValue: string) => {
      const trimmedValue = submittedValue.trim();
      if (trimmedValue.length > 0) {
        submitQuery(trimmedValue);
      }
    },
    [submitQuery],
  );

  const logger = useLogger();
  const [userMessages, setUserMessages] = useState<string[]>([]);

  useEffect(() => {
    const fetchUserMessages = async () => {
      const pastMessages = (await logger?.getPreviousUserMessages()) || [];
      if (pastMessages.length > 0) {
        setUserMessages(pastMessages.reverse());
      } else {
        setUserMessages(
          history
            .filter(
              (item): item is HistoryItem & { type: 'user'; text: string } =>
                item.type === 'user' &&
                typeof item.text === 'string' &&
                item.text.trim() !== '',
            )
            .map((item) => item.text),
        );
      }
    };
    fetchUserMessages();
  }, [history, logger]);

  const isInputActive = streamingState === StreamingState.Idle && !initError;

  const handleClearScreen = useCallback(() => {
    clearItems();
    clearConsoleMessagesState();
    console.clear();
    refreshStatic();
  }, [clearItems, clearConsoleMessagesState, refreshStatic]);

  const { rows: terminalHeight } = useTerminalSize();
  const mainControlsRef = useRef<DOMElement>(null);
  const pendingHistoryItemRef = useRef<DOMElement>(null);

  useEffect(() => {
    if (mainControlsRef.current) {
      const fullFooterMeasurement = measureElement(mainControlsRef.current);
      setFooterHeight(fullFooterMeasurement.height);
    }
  }, [terminalHeight, consoleMessages, showErrorDetails]);

  const availableTerminalHeight = useMemo(() => {
    const staticExtraHeight = /* margins and padding */ 3;
    return terminalHeight - footerHeight - staticExtraHeight;
  }, [terminalHeight, footerHeight]);

  useEffect(() => {
    if (!pendingHistoryItems.length) {
      return;
    }

    const pendingItemDimensions = measureElement(
      pendingHistoryItemRef.current!,
    );

    // If our pending history item happens to exceed the terminal height we will most likely need to refresh
    // our static collection to ensure no duplication or tearing. This is currently working around a core bug
    // in Ink which we have a PR out to fix: https://github.com/vadimdemedes/ink/pull/717
    if (pendingItemDimensions.height > availableTerminalHeight) {
      setStaticNeedsRefresh(true);
    }
  }, [pendingHistoryItems.length, availableTerminalHeight, streamingState]);

  useEffect(() => {
    if (streamingState === StreamingState.Idle && staticNeedsRefresh) {
      setStaticNeedsRefresh(false);
      refreshStatic();
    }
  }, [streamingState, refreshStatic, staticNeedsRefresh]);

  const filteredConsoleMessages = useMemo(() => {
    if (config.getDebugMode()) {
      return consoleMessages;
    }
    return consoleMessages.filter((msg) => msg.type !== 'debug');
  }, [consoleMessages, config]);

  return (
    <Box flexDirection="column" marginBottom={1} width="90%">
      {/*
       * The Static component is an Ink intrinsic in which there can only be 1 per application.
       * Because of this restriction we're hacking it slightly by having a 'header' item here to
       * ensure that it's statically rendered.
       *
       * Background on the Static Item: Anything in the Static component is written a single time
       * to the console. Think of it like doing a console.log and then never using ANSI codes to
       * clear that content ever again. Effectively it has a moving frame that every time new static
       * content is set it'll flush content to the terminal and move the area which it's "clearing"
       * down a notch. Without Static the area which gets erased and redrawn continuously grows.
       */}
      <Static
        key={staticKey}
        items={[
          <Box flexDirection="column" key="header">
            <Header />
            <Tips />
          </Box>,
          ...history.map((h) => (
            <HistoryItemDisplay
              availableTerminalHeight={availableTerminalHeight}
              key={h.id}
              item={h}
              isPending={false}
              streamingState={streamingState}
            />
          )),
        ]}
      >
        {(item) => item}
      </Static>
      <Box ref={pendingHistoryItemRef}>
        {pendingHistoryItems.map((item, i) => (
          <HistoryItemDisplay
            key={i}
            availableTerminalHeight={availableTerminalHeight}
            // TODO(taehykim): It seems like references to ids aren't necessary in
            // HistoryItemDisplay. Refactor later. Use a fake id for now.
            item={{ ...item, id: 0 }}
            isPending={true}
            streamingState={streamingState}
          />
        ))}
      </Box>
      {showHelp && <Help commands={slashCommands} />}

      <Box flexDirection="column" ref={mainControlsRef}>
        {startupWarnings.length > 0 && (
          <Box
            borderStyle="round"
            borderColor={Colors.AccentYellow}
            paddingX={1}
            marginY={1}
            flexDirection="column"
          >
            {startupWarnings.map((warning, index) => (
              <Text key={index} color={Colors.AccentYellow}>
                {warning}
              </Text>
            ))}
          </Box>
        )}

        {isThemeDialogOpen ? (
          <Box flexDirection="column">
            {themeError && (
              <Box marginBottom={1}>
                <Text color={Colors.AccentRed}>{themeError}</Text>
              </Box>
            )}
            <ThemeDialog
              onSelect={handleThemeSelect}
              onHighlight={handleThemeHighlight}
              settings={settings}
            />
          </Box>
        ) : (
          <>
            <LoadingIndicator
              isLoading={streamingState === StreamingState.Responding}
              showSpinner={shouldShowSpinner}
              currentLoadingPhrase={currentLoadingPhrase}
              elapsedTime={elapsedTime}
            />
            <Box
              marginTop={1}
              display="flex"
              justifyContent="space-between"
              width="100%"
            >
              <Box>
                {process.env.GEMINI_SYSTEM_MD && (
                  <Text color={Colors.AccentRed}>|⌐■_■| </Text>
                )}
                {geminiMdFileCount > 0 && (
                  <Text color={Colors.SubtleComment}>
                    Using {geminiMdFileCount} GEMINI.md file
                    {geminiMdFileCount > 1 ? 's' : ''}
                  </Text>
                )}
              </Box>
              <Box>
                {showAutoAcceptIndicator && !shellModeActive && (
                  <AutoAcceptIndicator />
                )}
                {shellModeActive && <ShellModeIndicator />}
              </Box>
            </Box>

            {showErrorDetails && (
              <DetailedMessagesDisplay messages={filteredConsoleMessages} />
            )}

            {isInputActive && (
              <InputPrompt
                widthFraction={0.9}
                onSubmit={handleFinalSubmit}
                userMessages={userMessages}
                onClearScreen={handleClearScreen}
                config={config}
                slashCommands={slashCommands}
                shellModeActive={shellModeActive}
                setShellModeActive={setShellModeActive}
              />
            )}
          </>
        )}

        {initError && streamingState !== StreamingState.Responding && (
          <Box
            borderStyle="round"
            borderColor={Colors.AccentRed}
            paddingX={1}
            marginBottom={1}
          >
            {history.find(
              (item) => item.type === 'error' && item.text?.includes(initError),
            )?.text ? (
              <Text color={Colors.AccentRed}>
                {
                  history.find(
                    (item) =>
                      item.type === 'error' && item.text?.includes(initError),
                  )?.text
                }
              </Text>
            ) : (
              <>
                <Text color={Colors.AccentRed}>
                  Initialization Error: {initError}
                </Text>
                <Text color={Colors.AccentRed}>
                  {' '}
                  Please check API key and configuration.
                </Text>
              </>
            )}
          </Box>
        )}

        <Footer
          config={config}
          debugMode={config.getDebugMode()}
          debugMessage={debugMessage}
          cliVersion={cliVersion}
          corgiMode={corgiMode}
          errorCount={errorCount}
          showErrorDetails={showErrorDetails}
        />
      </Box>
    </Box>
  );
};
