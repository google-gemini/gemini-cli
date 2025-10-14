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
import { ESC, SGR_MOUSE_REGEX } from './KeypressContext.js';

export type MouseEventName =
  | 'left-press'
  | 'left-release'
  | 'right-press'
  | 'right-release'
  | 'middle-press'
  | 'middle-release'
  | 'scroll-up'
  | 'scroll-down'
  | 'scroll-left'
  | 'scroll-right'
  | 'move';

export interface MouseEvent {
  name: MouseEventName;
  col: number;
  row: number;
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
}

export type MouseHandler = (event: MouseEvent) => void;

interface MouseContextValue {
  subscribe: (handler: MouseHandler) => void;
  unsubscribe: (handler: MouseHandler) => void;
}

const MouseContext = createContext<MouseContextValue | undefined>(undefined);

export function useMouseContext() {
  const context = useContext(MouseContext);
  if (!context) {
    throw new Error('useMouseContext must be used within a MouseProvider');
  }
  return context;
}

export function useMouse(handler: MouseHandler, { isActive = true } = {}) {
  const { subscribe, unsubscribe } = useMouseContext();

  useEffect(() => {
    if (!isActive) {
      return;
    }

    subscribe(handler);
    return () => unsubscribe(handler);
  }, [isActive, handler, subscribe, unsubscribe]);
}

export function MouseProvider({
  children,
  mouseEventsEnabled,
  debugKeystrokeLogging,
}: {
  children: React.ReactNode;
  mouseEventsEnabled?: boolean;
  debugKeystrokeLogging?: boolean;
}) {
  const { stdin } = useStdin();
  const subscribers = useRef<Set<MouseHandler>>(new Set()).current;

  const subscribe = useCallback(
    (handler: MouseHandler) => {
      subscribers.add(handler);
    },
    [subscribers],
  );

  const unsubscribe = useCallback(
    (handler: MouseHandler) => {
      subscribers.delete(handler);
    },
    [subscribers],
  );

  useEffect(() => {
    if (!mouseEventsEnabled) {
      return;
    }

    const broadcast = (event: MouseEvent) => {
      for (const handler of subscribers) {
        handler(event);
      }
    };

    const parseSGRMouseEvent = (
      buffer: string,
    ): { event: MouseEvent; length: number } | null => {
      const match = buffer.match(SGR_MOUSE_REGEX);

      if (match) {
        const buttonCode = parseInt(match[1], 10);
        const col = parseInt(match[2], 10);
        const row = parseInt(match[3], 10);
        const action = match[4];
        const isRelease = action === 'm';

        const shift = (buttonCode & 4) !== 0;
        const meta = (buttonCode & 8) !== 0;
        const ctrl = (buttonCode & 16) !== 0;
        const isMove = (buttonCode & 32) !== 0;

        let name: MouseEventName | null = null;

        if (buttonCode === 66) {
          name = 'scroll-left';
        } else if (buttonCode === 67) {
          name = 'scroll-right';
        } else if ((buttonCode & 64) === 64) {
          if ((buttonCode & 1) === 0) {
            name = 'scroll-up';
          } else {
            name = 'scroll-down';
          }
        } else if (isMove) {
          name = 'move';
        } else {
          const button = buttonCode & 3;
          const type = isRelease ? 'release' : 'press';
          switch (button) {
            case 0:
              name = `left-${type}`;
              break;
            case 1:
              name = `middle-${type}`;
              break;
            case 2:
              name = `right-${type}`;
              break;
            default:
              break;
          }
        }

        if (name) {
          return {
            event: {
              name,
              ctrl,
              meta,
              shift,
              col,
              row,
            },
            length: match[0].length,
          };
        }
        return null;
      }

      return null;
    };

    const handleData = (data: Buffer) => {
      let currentData = data;
      while (currentData.length > 0) {
        const dataStr = currentData.toString('utf-8');
        if (dataStr.startsWith(`${ESC}[<`)) {
          const parsed = parseSGRMouseEvent(dataStr);
          if (parsed) {
            if (debugKeystrokeLogging) {
              console.log(
                '[DEBUG] Mouse event parsed:',
                JSON.stringify(parsed.event),
              );
            }
            broadcast(parsed.event);
            currentData = currentData.slice(parsed.length);
            continue;
          }
        }
        break;
      }
    };

    stdin.on('data', handleData);

    return () => {
      stdin.removeListener('data', handleData);
    };
  }, [stdin, mouseEventsEnabled, subscribers, debugKeystrokeLogging]);

  return (
    <MouseContext.Provider value={{ subscribe, unsubscribe }}>
      {children}
    </MouseContext.Provider>
  );
}
