import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { HistoryItem } from './types.js';
import { useGeminiStream } from './hooks/useGeminiStream.js';
import { useLoadingIndicator } from './hooks/useLoadingIndicator.js';
import { useInputHistory } from './hooks/useInputHistory.js';
import Header from './components/Header.js';
import Tips from './components/Tips.js';
import HistoryDisplay from './components/HistoryDisplay.js';
import LoadingIndicator from './components/LoadingIndicator.js';
import InputPrompt from './components/InputPrompt.js';
import Footer from './components/Footer.js';
import { StreamingState } from '../core/gemini-stream.js';
import { PartListUnion } from '@google/genai';

const warningsFilePath = path.join(os.tmpdir(), 'gemini-code-cli-warnings.txt');

interface AppProps {
  directory: string;
}

const App = ({ directory }: AppProps) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [startupWarnings, setStartupWarnings] = useState<string[]>([]);
  const { streamingState, submitQuery, initError } =
    useGeminiStream(setHistory);
  const { elapsedTime, currentLoadingPhrase } =
    useLoadingIndicator(streamingState);

  const userMessages = useMemo(() => {
    return history
      .filter(
        (item): item is HistoryItem & { type: 'user'; text: string } =>
          item.type === 'user' &&
          typeof item.text === 'string' &&
          item.text.trim() !== '',
      )
      .map((item) => item.text);
  }, [history]);

  useEffect(() => {
    try {
      if (fs.existsSync(warningsFilePath)) {
        const warningsContent = fs.readFileSync(warningsFilePath, 'utf-8');
        setStartupWarnings(
          warningsContent.split('\n').filter((line) => line.trim() !== ''),
        );
        try {
          fs.unlinkSync(warningsFilePath);
        } catch (unlinkErr: any) {
          console.warn(
            `[App] Warning: Could not delete warnings file: ${unlinkErr.message}`,
          );
        }
      }
    } catch (err: any) {
      console.error(
        `[App] Error checking/reading warnings file: ${err.message}`,
      );
    }
  }, []);

  const isWaitingForToolConfirmation = history.some(
    (item) =>
      item.type === 'tool_group' &&
      item.tools.some((tool) => tool.confirmationDetails !== undefined),
  );
  const isInputActive =
    streamingState === StreamingState.Idle &&
    !initError &&
    !isWaitingForToolConfirmation;

  const { query, setQuery, resetHistoryNav, inputKey } = useInputHistory({
    userMessages,
    isActive: isInputActive,
  });

  const handleInputSubmit = (value: PartListUnion) => {
    resetHistoryNav();
    submitQuery(value)
      .then(() => {
        setQuery('');
      })
      .catch(() => {
        setQuery('');
      });
  };

  useEffect(() => {
    if (
      initError &&
      !history.some(
        (item) => item.type === 'error' && item.text?.includes(initError),
      )
    ) {
      setHistory((prev) => [
        ...prev,
        {
          id: Date.now(),
          type: 'error',
          text: `Initialization Error: ${initError}. Please check API key and configuration.`,
        } as HistoryItem,
      ]);
    }
  }, [initError, history]);

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
        <HistoryDisplay history={history} onSubmit={handleInputSubmit} />
        <LoadingIndicator
          isLoading={streamingState === StreamingState.Responding}
          currentLoadingPhrase={currentLoadingPhrase}
          elapsedTime={elapsedTime}
        />
      </Box>

      {!isWaitingForToolConfirmation && (
        <InputPrompt
          query={query}
          setQuery={setQuery}
          onSubmit={handleInputSubmit}
          isActive={isInputActive}
          forceKey={inputKey}
        />
      )}

      <Footer queryLength={query.length} />
    </Box>
  );
};

export default App;
