/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
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
  onLoadComplete: () => void;
}

export const useSessionPersistence = ({
  sessionPersistence,
  history,
  loadHistory,
  onLoadComplete,
}: UseSessionPersistenceProps) => {
  const historyRef = useRef(history);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);
  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      try {
        if (sessionPersistence) {
          const sessionPath = path.join(
            process.cwd(),
            '.gemini',
            'session.json',
          );
          try {
            const sessionData = await fsp.readFile(sessionPath, 'utf-8');
            const parsedHistory = JSON.parse(sessionData);

            if (!isMounted) return;

            if (Array.isArray(parsedHistory)) {
              const historyWithIds: HistoryItem[] = parsedHistory
                .filter(
                  (
                    item: unknown,
                  ): item is HistoryItemUser | HistoryItemGemini =>
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
                loadHistory([...historyWithIds, ...historyRef.current]);
              }
            }
          } catch (error) {
            if (!isMounted) return;

            // Silently ignore if file doesn't exist.
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
              return;
            }
            console.error('Error loading session history:', error);
          }
        }
      } finally {
        onLoadComplete();
      }
    };

    void loadSession();

    return () => {
      isMounted = false;
    };
  }, [sessionPersistence, loadHistory, onLoadComplete]);

  useEffect(() => {
    if (!sessionPersistence) {
      return;
    }

    const saveSession = () => {
      // The surrounding useEffect ensures this only runs when persistence is enabled.
      try {
        const geminiDir = USER_SETTINGS_DIR;
        if (!fs.existsSync(geminiDir)) {
          fs.mkdirSync(geminiDir, { recursive: true });
        }
        const sessionPath = path.join(geminiDir, 'session.json');

        // Create a serializable version of the history
        const MAX_PERSISTED_HISTORY = 200; // A reasonable default, could be made configurable.
        const serializableHistory = historyRef.current
          .filter(
            (item) =>
              item.type === MessageType.USER ||
              item.type === MessageType.GEMINI,
          )
          .slice(-MAX_PERSISTED_HISTORY)
          .map((item) => ({ type: item.type, text: item.text }));

        fs.writeFileSync(
          sessionPath,
          JSON.stringify(serializableHistory, null, 2),
        );
      } catch (error) {
        console.error('Error saving session history:', error);
      }
    };

    process.on('exit', saveSession);

    return () => {
      process.off('exit', saveSession);
    };
  }, [sessionPersistence]);
};
