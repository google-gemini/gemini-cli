import { useEffect } from 'react';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { HistoryItem } from '../types.js';

const warningsFilePath = path.join(os.tmpdir(), 'gemini-code-cli-warnings.txt');

// Effect to handle startup warnings
export function useStartupWarnings(
  setStartupWarnings: React.Dispatch<React.SetStateAction<string[]>>,
) {
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
          setStartupWarnings((prev) => [
            ...prev,
            `Warning: Could not delete temporary warnings file.`,
          ]);
        }
      }
    } catch (err: any) {
      setStartupWarnings((prev) => [
        ...prev,
        `Error checking/reading warnings file: ${err.message}`,
      ]);
    }
  }, [setStartupWarnings]); // Include setStartupWarnings in dependency array
}

// Effect to handle initialization errors
export function useInitializationErrorEffect(
  initError: string | null,
  history: HistoryItem[],
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>,
) {
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
  }, [initError, history, setHistory]); // Include setHistory in dependency array
} 