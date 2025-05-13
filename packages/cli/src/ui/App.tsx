/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo, useState } from 'react';
import { Box, Static, Text, useStdout } from 'ink';
import { StreamingState, type HistoryItem } from './types.js';
import { useGeminiStream } from './hooks/useGeminiStream.js';
import { useLoadingIndicator } from './hooks/useLoadingIndicator.js';
import { useInputHistory } from './hooks/useInputHistory.js';
import { useThemeCommand } from './hooks/useThemeCommand.js';
import { Header } from './components/Header.js';
import { LoadingIndicator } from './components/LoadingIndicator.js';
import { InputPrompt } from './components/InputPrompt.js';
import { Footer } from './components/Footer.js';
import { ThemeDialog } from './components/ThemeDialog.js';
import { useStartupWarnings } from './hooks/useAppEffects.js';
import { shortenPath, type Config } from '@gemini-code/server';
import { Colors } from './colors.js';
import { Help } from './components/Help.js';
import { LoadedSettings } from '../config/settings.js';
import { Tips } from './components/Tips.js';
import { ConsoleOutput } from './components/ConsolePatcher.js';
import { HistoryItemDisplay } from './components/HistoryItemDisplay.js';
import { useCompletion } from './hooks/useCompletion.js';
import { SuggestionsDisplay } from './components/SuggestionsDisplay.js';
import { isAtCommand, isSlashCommand } from './utils/commandUtils.js';
import { useHistory } from './hooks/useHistoryManager.js';

interface AppProps {
  config: Config;
  settings: LoadedSettings;
  cliVersion: string;
}

export const App = ({ config, settings, cliVersion }: AppProps) => {
  const { history, addItem, clearItems } = useHistory();
  const [startupWarnings, setStartupWarnings] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [themeError, setThemeError] = useState<string | null>(null);
  const {
    isThemeDialogOpen,
    openThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
  } = useThemeCommand(settings, setThemeError);

  const [staticKey, setStaticKey] = useState(0);
  const refreshStatic = useCallback(() => {
    setStaticKey((prev) => prev + 1);
  }, [setStaticKey]);

  const {
    streamingState,
    submitQuery,
    initError,
    debugMessage,
    slashCommands,
    pendingHistoryItem,
  } = useGeminiStream(
    addItem,
    clearItems,
    refreshStatic,
    setShowHelp,
    config,
    openThemeDialog,
  );
  const { elapsedTime, currentLoadingPhrase } =
    useLoadingIndicator(streamingState);

  useStartupWarnings(setStartupWarnings);

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

  // query and setQuery are now managed by useState here
  const [query, setQuery] = useState('');

  const completion = useCompletion(
    query,
    config.getTargetDir(),
    isInputActive && (isAtCommand(query) || isSlashCommand(query)),
    slashCommands,
  );

  const {
    handleSubmit: handleHistorySubmit,
    inputKey,
    setInputKey,
  } = useInputHistory({
    userMessages,
    onSubmit: (value) => {
      // Adapt onSubmit to use the lifted setQuery
      handleFinalSubmit(value);
      setQuery(''); // Clear query from the App's state
    },
    isActive: isInputActive && !completion.showSuggestions,
    query,
    setQuery,
  });

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
              <Box marginTop={1}>
                <Text color={Colors.SubtleComment}>cwd: </Text>
                <Text color={Colors.LightBlue}>
                  {shortenPath(config.getTargetDir(), 70)}
                </Text>
              </Box>

              <InputPrompt
                query={query}
                setQuery={setQuery}
                inputKey={inputKey}
                setInputKey={setInputKey}
                onSubmit={handleHistorySubmit}
                showSuggestions={completion.showSuggestions}
                suggestions={completion.suggestions}
                activeSuggestionIndex={completion.activeSuggestionIndex}
                navigateUp={completion.navigateUp}
                navigateDown={completion.navigateDown}
                resetCompletion={completion.resetCompletionState}
              />
              {completion.showSuggestions && (
                <Box marginTop={1}>
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
        queryLength={query.length}
        debugMode={config.getDebugMode()}
        debugMessage={debugMessage}
        cliVersion={cliVersion}
      />
      <ConsoleOutput />
    </Box>
  );
};
