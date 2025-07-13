/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import * as fs from 'fs';
import * as path from 'path';
import process from 'node:process';
import { HistoryItem, MessageType } from '../types.js';

interface UseSessionPersistenceProps {
  sessionPersistence: boolean | undefined;
  history: HistoryItem[];
  loadHistory: (history: HistoryItem[]) => void;
}

export const useSessionPersistence = ({
  sessionPersistence,
  history,
  loadHistory,
}: UseSessionPersistenceProps) => {
  useEffect(() => {
    if (sessionPersistence) {
      const sessionPath = path.join(process.cwd(), '.gemini', 'session.json');
      if (fs.existsSync(sessionPath)) {
        try {
          const sessionData = fs.readFileSync(sessionPath, 'utf-8');
          loadHistory(JSON.parse(sessionData));
        } catch (error) {
          console.error('Error loading session history:', error);
        }
      }
    }
  }, [sessionPersistence, loadHistory]);

  useEffect(() => {
    if (!sessionPersistence) {
      return;
    }

    const saveSession = () => {
      if (sessionPersistence) {
        const geminiDir = path.join(process.cwd(), '.gemini');
        if (!fs.existsSync(geminiDir)) {
          fs.mkdirSync(geminiDir, { recursive: true });
        }
        const sessionPath = path.join(geminiDir, 'session.json');

        // Create a serializable version of the history
        const serializableHistory = history
          .filter(
            (item) =>
              item.type === MessageType.USER ||
              item.type === MessageType.GEMINI,
          )
          .map((item) => ({ type: item.type, text: item.text }));

        try {
          fs.writeFileSync(
            sessionPath,
            JSON.stringify(serializableHistory, null, 2),
          );
        } catch (error) {
          console.error('Error saving session history:', error);
        }
      }
    };

    process.on('exit', saveSession);

    return () => {
      process.off('exit', saveSession);
    };
  }, [history, sessionPersistence]);
};
