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
import { shortenPath, type Config } from '@gemini-code/server';
import { Colors } from './colors.js';

interface AppProps {
  config: Config;
}

export const App = ({ config }: AppProps) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [startupWarnings, setStartupWarnings] = useState<string[]>([]);
  const { streamingState, submitQuery, initError } = useGeminiStream(
    setHistory,
    config.getApiKey(),
    config.getModel(),
  );
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

  const { query, handleSubmit: handleHistorySubmit } = useInputHistory({
    userMessages,
    onSubmit: submitQuery,
    isActive: isInputActive,
  });

  return (
    <Box flexDirection="column" padding={1} marginBottom={1} width="100%">
      <Header />

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

      {initError &&
        streamingState !== StreamingState.Responding &&
        !isWaitingForToolConfirmation && (
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

      <Box flexDirection="column">
        <HistoryDisplay history={history} onSubmit={submitQuery} />
        <LoadingIndicator
          isLoading={streamingState === StreamingState.Responding}
          currentLoadingPhrase={currentLoadingPhrase}
          elapsedTime={elapsedTime}
        />
      </Box>

      {isInputActive && (
        <>
          <Box>
            <Text color={Colors.SubtleComment}>cwd: </Text>
            <Text color={Colors.LightBlue}>
              {shortenPath(config.getTargetDir(), /*maxLength*/ 70)}
            </Text>
          </Box>

          <InputPrompt onSubmit={handleHistorySubmit} />
        </>
      )}

      <Footer queryLength={query.length} />
      <ITermDetectionWarning />
    </Box>
  );
};
