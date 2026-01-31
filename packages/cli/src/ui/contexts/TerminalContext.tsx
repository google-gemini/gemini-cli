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
  const bufferRef = useRef('');

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
    const handleData = (data: Buffer | string) => {
      bufferRef.current +=
        typeof data === 'string' ? data : data.toString('utf-8');

      // Check for OSC 11 response
      const match = bufferRef.current.match(
        TerminalCapabilityManager.OSC_11_REGEX,
      );
      if (match) {
        const colorStr = `rgb:${match[1]}/${match[2]}/${match[3]}`;
        for (const handler of subscribers) {
          handler(colorStr);
        }
        // Safely remove the processed part + match
        if (match.index !== undefined) {
          bufferRef.current = bufferRef.current.slice(
            match.index + match[0].length,
          );
        }
      } else if (bufferRef.current.length > 4096) {
        // Safety valve: if buffer gets too large without a match, trim it.
        // We keep the last 1024 bytes to avoid cutting off a partial sequence.
        bufferRef.current = bufferRef.current.slice(-1024);
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
