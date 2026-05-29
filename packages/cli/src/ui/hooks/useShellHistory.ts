/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { debugLogger, isNodeError, Storage } from '@google/gemini-cli-core';

const MAX_HISTORY_LENGTH = 100;

export interface UseShellHistoryReturn {
  history: string[];
  addCommandToHistory: (command: string) => void;
  getPreviousCommand: () => string | null;
  getNextCommand: () => string | null;
  resetHistoryPosition: () => void;
}

async function getHistoryFilePath(
  projectRoot: string,
  configStorage?: Storage,
): Promise<string> {
  const storage = configStorage ?? new Storage(projectRoot);
  await storage.initialize();
  return storage.getHistoryFilePath();
}

async function readHistoryFile(filePath: string): Promise<string[]> {
  try {
    const text = await fs.readFile(filePath, 'utf-8');
    // Each non-empty line is exactly one command, mirroring writeHistoryFile
    // which stores commands verbatim, one per line. (A previous version tried to
    // treat a trailing odd number of backslashes as a line-continuation marker,
    // but writeHistoryFile never produced that escaped format, so the only effect
    // was to merge real commands that legitimately end in a backslash — e.g. a
    // Windows path like `C:\` — into the following entry.)
    return text.split(/\r?\n/).filter((line) => line.trim() !== '');
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') return [];
    debugLogger.error('Error reading history:', err);
    return [];
  }
}

async function writeHistoryFile(
  filePath: string,
  history: string[],
): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, history.join('\n'));
  } catch (error) {
    debugLogger.error('Error writing shell history:', error);
  }
}

export function useShellHistory(
  projectRoot: string,
  storage?: Storage,
): UseShellHistoryReturn {
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyFilePath, setHistoryFilePath] = useState<string | null>(null);

  useEffect(() => {
    async function loadHistory() {
      const filePath = await getHistoryFilePath(projectRoot, storage);
      setHistoryFilePath(filePath);
      const loadedHistory = await readHistoryFile(filePath);
      setHistory(loadedHistory.reverse()); // Newest first
    }
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    loadHistory();
  }, [projectRoot, storage]);

  const addCommandToHistory = useCallback(
    (command: string) => {
      if (!command.trim() || !historyFilePath) {
        return;
      }
      const newHistory = [command, ...history.filter((c) => c !== command)]
        .slice(0, MAX_HISTORY_LENGTH)
        .filter(Boolean);
      setHistory(newHistory);
      // Write to file in reverse order (oldest first)
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      writeHistoryFile(historyFilePath, [...newHistory].reverse());
      setHistoryIndex(-1);
    },
    [history, historyFilePath],
  );

  const getPreviousCommand = useCallback(() => {
    if (history.length === 0) {
      return null;
    }
    const newIndex = Math.min(historyIndex + 1, history.length - 1);
    setHistoryIndex(newIndex);
    return history[newIndex] ?? null;
  }, [history, historyIndex]);

  const getNextCommand = useCallback(() => {
    if (historyIndex < 0) {
      return null;
    }
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    if (newIndex < 0) {
      return '';
    }
    return history[newIndex] ?? null;
  }, [history, historyIndex]);

  const resetHistoryPosition = useCallback(() => {
    setHistoryIndex(-1);
  }, []);

  return {
    history,
    addCommandToHistory,
    getPreviousCommand,
    getNextCommand,
    resetHistoryPosition,
  };
}
