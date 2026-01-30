/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useStdin } from 'ink';
import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from 'react';
import { TerminalCapabilityManager } from '../utils/terminalCapabilityManager.js';

export type TerminalEventHandler = (event: string) => void;

interface TerminalContextValue {
  subscribe: (handler: TerminalEventHandler) => void;
  unsubscribe: (handler: TerminalEventHandler) => void;
}

const TerminalContext = createContext<TerminalContextValue | undefined>(
  undefined,
);

export function useTerminalContext() {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error(
      'useTerminalContext must be used within a TerminalProvider',
    );
  }
  return context;
}

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const { stdin } = useStdin();
  const subscribers = useRef<Set<TerminalEventHandler>>(new Set()).current;

  const subscribe = useCallback(
    (handler: TerminalEventHandler) => {
      subscribers.add(handler);
    },
    [subscribers],
  );

  const unsubscribe = useCallback(
    (handler: TerminalEventHandler) => {
      subscribers.delete(handler);
    },
    [subscribers],
  );

  useEffect(() => {
    let buffer = '';

    const handleData = (data: Buffer | string) => {
      buffer += typeof data === 'string' ? data : data.toString('utf-8');

      // Check for OSC 11 response
      const match = buffer.match(TerminalCapabilityManager.OSC_11_REGEX);
      if (match) {
        const colorStr = `rgb:${match[1]}/${match[2]}/${match[3]}`;
        for (const handler of subscribers) {
          handler(colorStr);
        }
        buffer = buffer.slice(match.index! + match[0].length);
      } else if (buffer.length > 1024) {
        // Safety valve to prevent infinite buffer growth
        buffer = buffer.slice(-1024);
      }
    };

    stdin.on('data', handleData);
    return () => {
      stdin.removeListener('data', handleData);
    };
  }, [stdin, subscribers]);

  return (
    <TerminalContext.Provider value={{ subscribe, unsubscribe }}>
      {children}
    </TerminalContext.Provider>
  );
}
