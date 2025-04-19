/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import type { HistoryItem } from './types.js';
import { useGeminiStream } from './hooks/useGeminiStream.js';
import { useLoadingIndicator } from './hooks/useLoadingIndicator.js';
import { useInputHistory } from './hooks/useInputHistory.js';
import { Header } from './components/Header.js';
import { Tips } from './components/Tips.js';
import { HistoryDisplay } from './components/HistoryDisplay.js';
import { LoadingIndicator } from './components/LoadingIndicator.js';
import { InputPrompt } from './components/InputPrompt.js';
import { Footer } from './components/Footer.js';
import { StreamingState } from '../core/gemini-stream.js';
import { ITermDetectionWarning } from './utils/itermDetection.js';
import {
  useStartupWarnings,
  useInitializationErrorEffect,
} from './hooks/useAppEffects.js';

interface AppProps {
  directory: string;
}

export const App = ({ directory }: AppProps) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [startupWarnings, setStartupWarnings] = useState<string[]>([]);
  const { streamingState, submitQuery, initError } =
    useGeminiStream(setHistory);
  const { elapsedTime, currentLoadingPhrase } =
    useLoadingIndicator(streamingState);

  useStartupWarnings(setStartupWarnings);
  useInitializationErrorEffect(initError, history, setHistory);

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

  const isWaitingForToolConfirmation = history.some(
    (item) =>
      item.type === 'tool_group' &&
      item.tools.some((tool) => tool.confirmationDetails !== undefined),
  );
  const isInputActive =
    streamingState === StreamingState.Idle &&
    !initError &&
    !isWaitingForToolConfirmation;

  const {
    query,
    setQuery,
    handleSubmit: handleHistorySubmit,
    inputKey,
  } = useInputHistory({
    userMessages,
    onSubmit: submitQuery,
    isActive: isInputActive,
  });

  return (
    <Box flexDirection="column" padding={1} marginBottom={1} width="100%">
      <Header cwd={directory} />

      {startupWarnings.length > 0 && (
        <Box
          borderStyle="round"
          borderColor="yellow"
          paddingX={1}
          marginY={1}
          flexDirection="column"
        >
          {startupWarnings.map((warning, index) => (
            <Text key={index} color="yellow">
              {warning}
            </Text>
          ))}
        </Box>
      )}

      <Tips />

      {initError &&
        streamingState !== StreamingState.Responding &&
        !isWaitingForToolConfirmation && (
          <Box
            borderStyle="round"
            borderColor="red"
            paddingX={1}
            marginBottom={1}
          >
            {history.find(
              (item) => item.type === 'error' && item.text?.includes(initError),
            )?.text ? (
              <Text color="red">
                {
                  history.find(
                    (item) =>
                      item.type === 'error' && item.text?.includes(initError),
                  )?.text
                }
              </Text>
            ) : (
              <>
                <Text color="red">Initialization Error: {initError}</Text>
                <Text color="red">
                  {' '}
                  Please check API key and configuration.
                </Text>
              </>
            )}
          </Box>
        )}

      <Box flexDirection="column">
        <HistoryDisplay history={history} onSubmit={submitQuery} />
        <LoadingIndicator
          isLoading={streamingState === StreamingState.Responding}
          currentLoadingPhrase={currentLoadingPhrase}
          elapsedTime={elapsedTime}
        />
      </Box>

      {isInputActive && (
        <InputPrompt
          query={query}
          setQuery={setQuery}
          onSubmit={handleHistorySubmit}
          isActive={isInputActive}
          forceKey={inputKey}
        />
      )}

      {process.env.TERM_PROGRAM === 'iTerm.app' && (
        <Box marginTop={1}>
          <Text dimColor>Note: Flickering may occur in iTerm.</Text>
        </Box>
      )}

      <Footer queryLength={query.length} />
      <ITermDetectionWarning />
    </Box>
  );
};
