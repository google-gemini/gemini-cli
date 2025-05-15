/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Static, Text, useStdout } from 'ink';
import { StreamingState, type HistoryItem } from './types.js';
import { useGeminiStream } from './hooks/useGeminiStream.js';
import { useLoadingIndicator } from './hooks/useLoadingIndicator.js';
import { useThemeCommand } from './hooks/useThemeCommand.js';
import { useSlashCommandProcessor } from './hooks/slashCommandProcessor.js';
import { Header } from './components/Header.js';
import { LoadingIndicator } from './components/LoadingIndicator.js';
import { EditorState, InputPrompt } from './components/InputPrompt.js';
import { Footer } from './components/Footer.js';
import { ThemeDialog } from './components/ThemeDialog.js';
import { shortenPath, type Config } from '@gemini-code/server';
import { Colors } from './colors.js';
import { Help } from './components/Help.js';
import { loadHierarchicalGeminiMemory } from '../config/config.js';
import { LoadedSettings } from '../config/settings.js';
import { Tips } from './components/Tips.js';
import { ConsoleOutput } from './components/ConsolePatcher.js';
import { HistoryItemDisplay } from './components/HistoryItemDisplay.js';
import { useCompletion } from './hooks/useCompletion.js';
import { SuggestionsDisplay } from './components/SuggestionsDisplay.js';
import { isAtCommand, isSlashCommand } from './utils/commandUtils.js';
import { useHistory } from './hooks/useHistoryManager.js';
import process from 'node:process'; // For performMemoryRefresh
import { MessageType } from './types.js'; // For performMemoryRefresh
import { getErrorMessage } from '@gemini-code/server'; // For performMemoryRefresh

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
  const [staticKey, setStaticKey] = useState(0);
  const refreshStatic = useCallback(() => {
    setStaticKey((prev) => prev + 1);
  }, [setStaticKey]);

  const [geminiMdFileCount, setGeminiMdFileCount] = useState<number>(0); // Added for memory file count
  const [debugMessage, setDebugMessage] = useState<string>('');
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [themeError, setThemeError] = useState<string | null>(null);

  const {
    isThemeDialogOpen,
    openThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
  } = useThemeCommand(settings, setThemeError);

  // useEffect to initialize geminiMdFileCount from config when config is ready
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

      // chatSessionRef.current = null; // This was in useGeminiStream, might need similar logic or pass chat ref
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
    config, // Pass config
    addItem,
    clearItems,
    refreshStatic,
    setShowHelp,
    setDebugMessage,
    openThemeDialog,
    performMemoryRefresh,
  );

  const { streamingState, submitQuery, initError, pendingHistoryItem } =
    useGeminiStream(
      addItem,
      clearItems,
      refreshStatic,
      setShowHelp,
      config,
      setDebugMessage,
      openThemeDialog,
      handleSlashCommand,
    );
  const { elapsedTime, currentLoadingPhrase } =
    useLoadingIndicator(streamingState);

  const handleFinalSubmit = useCallback(
    (submittedValue: string) => {
      const trimmedValue = submittedValue.trim();
      if (trimmedValue.length > 0) {
        submitQuery(submittedValue);
      }
    },
    [submitQuery],
  );

  const userMessages = useMemo(
    () =>
      history
        .filter(
          (item): item is HistoryItem & { type: 'user'; text: string } =>
            item.type === 'user' &&
            typeof item.text === 'string' &&
            item.text.trim() !== '',
        )
        .map((item) => item.text),
    [history],
  );

  const isInputActive = streamingState === StreamingState.Idle && !initError;

  const [query, setQuery] = useState('');
  const [editorState, setEditorState] = useState<EditorState>({
    key: 0,
    initialCursorOffset: undefined,
  });

  const onChangeAndMoveCursor = useCallback(
    (value: string) => {
      setQuery(value);
      setEditorState((s) => ({
        key: s.key + 1,
        initialCursorOffset: value.length,
      }));
    },
    [setQuery, setEditorState],
  );

  const handleClearScreen = useCallback(() => {
    clearItems();
    console.clear();
    refreshStatic();
  }, [clearItems, refreshStatic]);

  const completion = useCompletion(
    query,
    config.getTargetDir(),
    isInputActive && (isAtCommand(query) || isSlashCommand(query)),
    slashCommands,
  );

  // --- Render Logic ---

  // Get terminal width
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns ?? 80;
  // Calculate width for suggestions, leave some padding
  const suggestionsWidth = Math.max(60, Math.floor(terminalWidth * 0.8));

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
      <Static key={'static-key-' + staticKey} items={['header', ...history]}>
        {(item, index) => {
          if (item === 'header') {
            return (
              <Box flexDirection="column" key={'header-' + index}>
                <Header />
                <Tips />
              </Box>
            );
          }

          const historyItem = item as HistoryItem;
          return (
            <HistoryItemDisplay
              key={'history-' + historyItem.id}
              item={historyItem}
              onSubmit={submitQuery}
            />
          );
        }}
      </Static>
      {pendingHistoryItem && (
        <HistoryItemDisplay
          // TODO(taehykim): It seems like references to ids aren't necessary in
          // HistoryItemDisplay. Refactor later. Use a fake id for now.
          item={{ ...pendingHistoryItem, id: 0 }}
          onSubmit={submitQuery}
        />
      )}
      {showHelp && <Help commands={slashCommands} />}

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
            setQuery={setQuery}
          />
        </Box>
      ) : (
        <>
          <LoadingIndicator
            isLoading={streamingState === StreamingState.Responding}
            currentLoadingPhrase={currentLoadingPhrase}
            elapsedTime={elapsedTime}
          />
          {isInputActive && (
            <>
              <Box
                marginTop={1}
                display="flex"
                justifyContent="space-between"
                width="100%"
              >
                <Box>
                  <Text color={Colors.SubtleComment}>cwd: </Text>
                  <Text color={Colors.LightBlue}>
                    {shortenPath(config.getTargetDir(), 70)}
                  </Text>
                </Box>
              </Box>

              <InputPrompt
                query={query}
                onChange={setQuery}
                onChangeAndMoveCursor={onChangeAndMoveCursor}
                editorState={editorState}
                onSubmit={handleFinalSubmit} // Pass handleFinalSubmit directly
                showSuggestions={completion.showSuggestions}
                suggestions={completion.suggestions}
                activeSuggestionIndex={completion.activeSuggestionIndex}
                userMessages={userMessages} // Pass userMessages
                navigateSuggestionUp={completion.navigateUp}
                navigateSuggestionDown={completion.navigateDown}
                resetCompletion={completion.resetCompletionState}
                setEditorState={setEditorState}
                onClearScreen={handleClearScreen} // Added onClearScreen prop
              />
              {completion.showSuggestions && (
                <Box>
                  <SuggestionsDisplay
                    suggestions={completion.suggestions}
                    activeIndex={completion.activeSuggestionIndex}
                    isLoading={completion.isLoadingSuggestions}
                    width={suggestionsWidth}
                    scrollOffset={completion.visibleStartIndex}
                  />
                </Box>
              )}
            </>
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
        geminiMdFileCount={geminiMdFileCount}
      />
      <ConsoleOutput />
    </Box>
  );
};
