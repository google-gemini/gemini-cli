import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { HistoryItem } from './types.js';
import { useGeminiStream } from './hooks/useGeminiStream.js';
import { useLoadingIndicator } from './hooks/useLoadingIndicator.js';
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
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [startupWarnings, setStartupWarnings] = useState<string[]>([]);
  const { streamingState, submitQuery, initError } =
    useGeminiStream(setHistory);
  const { elapsedTime, currentLoadingPhrase } =
    useLoadingIndicator(streamingState);

  useEffect(() => {
    try {
      if (fs.existsSync(warningsFilePath)) {
        console.log('[App] Found warnings file:', warningsFilePath);
        const warningsContent = fs.readFileSync(warningsFilePath, 'utf-8');
        setStartupWarnings(warningsContent.split('\n').filter(line => line.trim() !== ''));
        try {
            fs.unlinkSync(warningsFilePath);
        } catch (unlinkErr: any) {
             console.warn(`[App] Warning: Could not delete warnings file: ${unlinkErr.message}`);
        }
      } else {
         console.log('[App] No warnings file found.');
      }
    } catch (err: any) {
      console.error(`[App] Error checking/reading warnings file: ${err.message}`);
    }
  }, []);

  const handleInputSubmit = (value: PartListUnion) => {
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

  const isWaitingForToolConfirmation = history.some(
    (item) =>
      item.type === 'tool_group' &&
      item.tools.some((tool) => tool.confirmationDetails !== undefined),
  );
  const isInputActive = streamingState === StreamingState.Idle && !initError;

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

      {!isWaitingForToolConfirmation && isInputActive && (
        <InputPrompt
          query={query}
          setQuery={setQuery}
          onSubmit={handleInputSubmit}
          isActive={isInputActive}
        />
      )}

      <Footer queryLength={query.length} />
    </Box>
  );
};

export default App;
