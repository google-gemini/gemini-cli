/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import * as fs from 'fs/promises';
import * as path from 'path';
import { isNodeError, getProjectTempDir } from '@google/gemini-cli-core';

const HISTORY_FILE = 'shell_history';
const MAX_HISTORY_LENGTH = 100;

async function getHistoryFilePath(projectRoot: string): Promise<string> {
  const historyDir = getProjectTempDir(projectRoot);
  return path.join(historyDir, HISTORY_FILE);
}

async function readHistoryFile(filePath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.split('\n').filter(Boolean);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return [];
    }
    console.error('Error reading shell history:', error);
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
    console.error('Error writing shell history:', error);
  }
}

export function useShellHistory(projectRoot: string) {
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyFilePath, setHistoryFilePath] = useState<string | null>(null);
  const [matchingCommands, setMatchingCommands] = useState<string[]>([]);
  const [matchingIndex, setMatchingIndex] = useState(-1);

  useEffect(() => {
    async function loadHistory() {
      const filePath = await getHistoryFilePath(projectRoot);
      setHistoryFilePath(filePath);
      const loadedHistory = await readHistoryFile(filePath);
      setHistory(loadedHistory.reverse()); // Newest first
    }
    loadHistory();
  }, [projectRoot]);

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

  const getMatchingCommand = useCallback(
    (toMatch: string) => {
      const query = toMatch.trim();
      if (!query) {
        setMatchingCommands([]);
        setMatchingIndex(-1);
        return null;
      }

      const matches = history.filter((cmd) =>
        cmd.toLowerCase().includes(query.toLowerCase()),
      );

      setMatchingCommands(matches);
      if (matches.length > 0) {
        setMatchingIndex(0);
        return matches[0];
      }
      setMatchingIndex(-1);
      return null;
    },
    [history],
  );

  const getPreviousMatchingCommand = useCallback((): string | null => {
    if (matchingCommands.length === 0) return null;
    const newIndex =
      matchingIndex < 0
        ? 0
        : Math.min(matchingIndex + 1, matchingCommands.length - 1);
    setMatchingIndex(newIndex);
    return matchingCommands[newIndex] ?? null;
  }, [matchingCommands, matchingIndex]);

  const getNextMatchingCommand = useCallback((): string | null => {
    if (matchingCommands.length === 0) {
      return null;
    }
    const newIndex = matchingIndex - 1;
    if (newIndex < 0) {
      setMatchingIndex(-1);
      return '';
    }
    setMatchingIndex(newIndex);
    return matchingCommands[newIndex] ?? null;
  }, [matchingCommands, matchingIndex]);

  const resetMatching = useCallback(() => {
    setMatchingCommands([]);
    setMatchingIndex(-1);
  }, []);

  return {
    addCommandToHistory,
    getPreviousCommand,
    getNextCommand,
    getMatchingCommand,
    getPreviousMatchingCommand,
    getNextMatchingCommand,
    resetMatching,

    resetHistoryPosition: () => setHistoryIndex(-1),
  };
}
