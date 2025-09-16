/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useStdin } from 'ink';
import { parse, type MouseEvent } from '../mouse/mouse.js';

export type MouseHandler = (event: MouseEvent) => void;

export interface MouseContextValue {
  subscribe(onMouseEvent: MouseHandler): void;
  unsubscribe(onMouseEvent: MouseHandler): void;
}

const MouseContext = createContext<MouseContextValue>({
  subscribe: () => {},
  unsubscribe: () => {},
});

export function useMouseContext() {
  return useContext(MouseContext);
}

export function MouseContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [subscribers, setSubscribers] = useState<Set<MouseHandler>>(new Set());
  const { stdin, isRawModeSupported } = useStdin();

  useEffect(() => {
    if (!isRawModeSupported || subscribers.size === 0) {
      return;
    }

    const handleData = (data: Buffer) => {
      const event = parse(data);
      if (event) {
        for (const subscriber of subscribers) {
          subscriber(event);
        }
      }
    };

    // Enable mouse tracking
    process.stdout.write('\x1b[?1003h\x1b[?1006h');
    stdin.on('data', handleData);

    return () => {
      stdin.off('data', handleData);
      // Disable mouse tracking
      process.stdout.write('\x1b[?1003l\x1b[?1006l');
    };
  }, [stdin, isRawModeSupported, subscribers]);

  const contextValue = useMemo(
    () => ({
      subscribe: (onMouseEvent: MouseHandler) => {
        setSubscribers((prev) => new Set(prev).add(onMouseEvent));
      },
      unsubscribe: (onMouseEvent: MouseHandler) => {
        setSubscribers((prev) => {
          const next = new Set(prev);
          next.delete(onMouseEvent);
          return next;
        });
      },
    }),
    [],
  );

  return (
    <MouseContext.Provider value={contextValue}>
      {children}
    </MouseContext.Provider>
  );
}
