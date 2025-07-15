/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import * as fs from 'fs';
import { promises as fsp } from 'fs';
import * as path from 'path';
import process from 'node:process';
import {
  HistoryItem,
  MessageType,
  HistoryItemUser,
  HistoryItemGemini,
} from '../types.js';

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
    const loadSession = async () => {
      if (sessionPersistence) {
        const sessionPath = path.join(process.cwd(), '.gemini', 'session.json');
        try {
          const sessionData = await fsp.readFile(sessionPath, 'utf-8');
          const parsedHistory = JSON.parse(sessionData);
          if (Array.isArray(parsedHistory)) {
            const historyWithIds: HistoryItem[] = parsedHistory
              .filter(
                (item: unknown): item is HistoryItemUser | HistoryItemGemini =>
                  item !== null &&
                  typeof item === 'object' &&
                  'type' in item &&
                  (item.type === MessageType.USER ||
                    item.type === MessageType.GEMINI) &&
                  'text' in item &&
                  typeof (item as { text: unknown }).text === 'string',
              )
              .map((item, index) => ({
                type: item.type,
                text: item.text,
                id: -(index + 1),
              }));
            if (historyWithIds.length > 0) {
              loadHistory(historyWithIds);
            }
          }
        } catch (error) {
          // Silently ignore if file doesn't exist.
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return;
          }
          console.error('Error loading session history:', error);
        }
      }
    };

    void loadSession();
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
