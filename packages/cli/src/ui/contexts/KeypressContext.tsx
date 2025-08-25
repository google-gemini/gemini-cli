/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';
import {
  KittySequenceOverflowEvent,
  logKittySequenceOverflow,
} from '@google/gemini-cli-core';
import { useStdin } from 'ink';
import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from 'react';
import readline from 'node:readline';
import { PassThrough } from 'node:stream';
import {
  BACKSLASH_ENTER_DETECTION_WINDOW_MS,
  CHAR_CODE_ESC,
  KITTY_CTRL_C,
  KITTY_KEYCODE_BACKSPACE,
  KITTY_KEYCODE_ENTER,
  KITTY_KEYCODE_NUMPAD_ENTER,
  KITTY_KEYCODE_TAB,
  MAX_KITTY_SEQUENCE_LENGTH,
} from '../utils/platformConstants.js';

import { FOCUS_IN, FOCUS_OUT } from '../hooks/useFocus.js';

const ESC = '\u001B';
export const PASTE_MODE_PREFIX = `${ESC}[200~`;
export const PASTE_MODE_SUFFIX = `${ESC}[201~`;

export interface Key {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  paste: boolean;
  sequence: string;
  kittyProtocol?: boolean;
}

export type KeypressHandler = (key: Key) => void;

interface KeypressContextValue {
  subscribe: (handler: KeypressHandler) => void;
  unsubscribe: (handler: KeypressHandler) => void;
}

const KeypressContext = createContext<KeypressContextValue | undefined>(
  undefined,
);

export function useKeypressContext() {
  const context = useContext(KeypressContext);
  if (!context) {
    throw new Error(
      'useKeypressContext must be used within a KeypressProvider',
    );
  }
  return context;
}

export function KeypressProvider({
  children,
  kittyProtocolEnabled,
  config,
  debugKeystrokeLogging,
}: {
  children: React.ReactNode;
  kittyProtocolEnabled: boolean;
  config?: Config;
  debugKeystrokeLogging?: boolean;
}) {
  const { stdin, setRawMode } = useStdin();
  const subscribers = useRef<Set<KeypressHandler>>(new Set()).current;

  const subscribe = useCallback(
    (handler: KeypressHandler) => {
      subscribers.add(handler);
    },
    [subscribers],
  );

  const unsubscribe = useCallback(
    (handler: KeypressHandler) => {
      subscribers.delete(handler);
    },
    [subscribers],
  );

  useEffect(() => {
    setRawMode(true);

    const keypressStream = new PassThrough();
    let usePassthrough = false;
    const nodeMajorVersion = parseInt(process.versions.node.split('.')[0], 10);
    if (
      nodeMajorVersion < 20 ||
      process.env['PASTE_WORKAROUND'] === '1' ||
      process.env['PASTE_WORKAROUND'] === 'true'
    ) {
      usePassthrough = true;
    }

    let isPaste = false;
    let pasteBuffer = Buffer.alloc(0);
    let kittySequenceBuffer = '';
    let backslashTimeout: NodeJS.Timeout | null = null;
    let waitingForEnterAfterBackslash = false;

    const parseKittySequence = (sequence: string): Key | null => {
      const kittyPattern = new RegExp(`^${ESC}\\[(\\d+)(;(\\d+))?([u~])$`);
      const match = sequence.match(kittyPattern);
      if (!match) return null;

      const keyCode = parseInt(match[1], 10);
      const modifiers = match[3] ? parseInt(match[3], 10) : 1;
      const modifierBits = modifiers - 1;
      const shift = (modifierBits & 1) === 1;
      const alt = (modifierBits & 2) === 2;
      const ctrl = (modifierBits & 4) === 4;

      const keyNameMap: Record<number, string> = {
        [CHAR_CODE_ESC]: 'escape',
        [KITTY_KEYCODE_TAB]: 'tab',
        [KITTY_KEYCODE_BACKSPACE]: 'backspace',
        [KITTY_KEYCODE_ENTER]: 'return',
        [KITTY_KEYCODE_NUMPAD_ENTER]: 'return',
      };

      if (keyCode in keyNameMap) {
        return {
          name: keyNameMap[keyCode],
          ctrl,
          meta: alt,
          shift,
          paste: false,
          sequence,
          kittyProtocol: true,
        };
      }

      if (keyCode >= 97 && keyCode <= 122 && ctrl) {
        const letter = String.fromCharCode(keyCode);
        return {
          name: letter,
          ctrl: true,
          meta: alt,
          shift,
          paste: false,
          sequence,
          kittyProtocol: true,
        };
      }

      return null;
    };

    const broadcast = (key: Key) => {
      for (const handler of subscribers) {
        handler(key);
      }
    };

    const handleKeypress = (_: unknown, key: Key) => {
      if (key.name === 'paste-start') {
        isPaste = true;
        return;
      }
      if (key.name === 'paste-end') {
        isPaste = false;
        broadcast({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: true,
          sequence: pasteBuffer.toString(),
        });
        pasteBuffer = Buffer.alloc(0);
        return;
      }

      if (isPaste) {
        pasteBuffer = Buffer.concat([pasteBuffer, Buffer.from(key.sequence)]);
        return;
      }

      if (key.name === 'return' && waitingForEnterAfterBackslash) {
        if (backslashTimeout) {
          clearTimeout(backslashTimeout);
          backslashTimeout = null;
        }
        waitingForEnterAfterBackslash = false;
        broadcast({
          ...key,
          shift: true,
          sequence: '\r', // Corrected escaping for newline
        });
        return;
      }

      if (key.sequence === '\\' && !key.name) {
        // Corrected escaping for backslash
        waitingForEnterAfterBackslash = true;
        backslashTimeout = setTimeout(() => {
          waitingForEnterAfterBackslash = false;
          backslashTimeout = null;
          broadcast(key);
        }, BACKSLASH_ENTER_DETECTION_WINDOW_MS);
        return;
      }

      if (waitingForEnterAfterBackslash && key.name !== 'return') {
        if (backslashTimeout) {
          clearTimeout(backslashTimeout);
          backslashTimeout = null;
        }
        waitingForEnterAfterBackslash = false;
        broadcast({
          name: '',
          sequence: '\\',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
        });
      }

      if (['up', 'down', 'left', 'right'].includes(key.name)) {
        broadcast(key);
        return;
      }

      if (
        (key.ctrl && key.name === 'c') ||
        key.sequence === `${ESC}${KITTY_CTRL_C}`
      ) {
        if (kittySequenceBuffer && debugKeystrokeLogging) {
          console.log(
            '[DEBUG] Kitty buffer cleared on Ctrl+C:',
            kittySequenceBuffer,
          );
        }
        kittySequenceBuffer = '';
        if (key.sequence === `${ESC}${KITTY_CTRL_C}`) {
          broadcast({
            name: 'c',
            ctrl: true,
            meta: false,
            shift: false,
            paste: false,
            sequence: key.sequence,
            kittyProtocol: true,
          });
        } else {
          broadcast(key);
        }
        return;
      }

      if (kittyProtocolEnabled) {
        if (
          kittySequenceBuffer ||
          (key.sequence.startsWith(`${ESC}[`) &&
            !key.sequence.startsWith(PASTE_MODE_PREFIX) &&
            !key.sequence.startsWith(PASTE_MODE_SUFFIX) &&
            !key.sequence.startsWith(FOCUS_IN) &&
            !key.sequence.startsWith(FOCUS_OUT))
        ) {
          kittySequenceBuffer += key.sequence;

          if (debugKeystrokeLogging) {
            console.log(
              '[DEBUG] Kitty buffer accumulating:',
              kittySequenceBuffer,
            );
          }

          const kittyKey = parseKittySequence(kittySequenceBuffer);
          if (kittyKey) {
            if (debugKeystrokeLogging) {
              console.log(
                '[DEBUG] Kitty sequence parsed successfully:',
                kittySequenceBuffer,
              );
            }
            kittySequenceBuffer = '';
            broadcast(kittyKey);
            return;
          }

          if (config?.getDebugMode() || debugKeystrokeLogging) {
            const codes = Array.from(kittySequenceBuffer).map((ch) =>
              ch.charCodeAt(0),
            );
            console.warn('Kitty sequence buffer has char codes:', codes);
          }

          if (kittySequenceBuffer.length > MAX_KITTY_SEQUENCE_LENGTH) {
            if (debugKeystrokeLogging) {
              console.log(
                '[DEBUG] Kitty buffer overflow, clearing:',
                kittySequenceBuffer,
              );
            }
            if (config) {
              const event = new KittySequenceOverflowEvent(
                kittySequenceBuffer.length,
                kittySequenceBuffer,
              );
              logKittySequenceOverflow(config, event);
            }
            kittySequenceBuffer = '';
          } else {
            return;
          }
        }
      }

      if (key.name === 'return' && key.sequence === `${ESC}\r`) {
        key.meta = true;
      }
      broadcast({ ...key, paste: isPaste });
    };

    const handleRawKeypress = (data: Buffer) => {
      const pasteModePrefixBuffer = Buffer.from(PASTE_MODE_PREFIX);
      const pasteModeSuffixBuffer = Buffer.from(PASTE_MODE_SUFFIX);

      let pos = 0;
      while (pos < data.length) {
        const prefixPos = data.indexOf(pasteModePrefixBuffer, pos);
        const suffixPos = data.indexOf(pasteModeSuffixBuffer, pos);
        const isPrefixNext =
          prefixPos !== -1 && (suffixPos === -1 || prefixPos < suffixPos);
        const isSuffixNext =
          suffixPos !== -1 && (prefixPos === -1 || suffixPos < prefixPos);

        let nextMarkerPos = -1;
        let markerLength = 0;

        if (isPrefixNext) {
          nextMarkerPos = prefixPos;
        } else if (isSuffixNext) {
          nextMarkerPos = suffixPos;
        }
        markerLength = pasteModeSuffixBuffer.length;

        if (nextMarkerPos === -1) {
          keypressStream.write(data.slice(pos));
          return;
        }

        const nextData = data.slice(pos, nextMarkerPos);
        if (nextData.length > 0) {
          keypressStream.write(nextData);
        }
        const createPasteKeyEvent = (
          name: 'paste-start' | 'paste-end',
        ): Key => ({
          name,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: '',
        });
        if (isPrefixNext) {
          handleKeypress(undefined, createPasteKeyEvent('paste-start'));
        } else if (isSuffixNext) {
          handleKeypress(undefined, createPasteKeyEvent('paste-end'));
        }
        pos = nextMarkerPos + markerLength;
      }
    };

    let rl: readline.Interface;
    if (usePassthrough) {
      rl = readline.createInterface({
        input: keypressStream,
        escapeCodeTimeout: 0,
      });
      readline.emitKeypressEvents(keypressStream, rl);
      keypressStream.on('keypress', handleKeypress);
      stdin.on('data', handleRawKeypress);
    } else {
      rl = readline.createInterface({ input: stdin, escapeCodeTimeout: 0 });
      readline.emitKeypressEvents(stdin, rl);
      stdin.on('keypress', handleKeypress);
    }

    return () => {
      if (usePassthrough) {
        keypressStream.removeListener('keypress', handleKeypress);
        stdin.removeListener('data', handleRawKeypress);
      } else {
        stdin.removeListener('keypress', handleKeypress);
      }

      rl.close();

      // Restore the terminal to its original state.
      setRawMode(false);

      if (backslashTimeout) {
        clearTimeout(backslashTimeout);
        backslashTimeout = null;
      }

      // Flush any pending paste data to avoid data loss on exit.
      if (isPaste) {
        broadcast({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: true,
          sequence: pasteBuffer.toString(),
        });
        pasteBuffer = Buffer.alloc(0);
      }
    };
  }, [
    stdin,
    setRawMode,
    kittyProtocolEnabled,
    config,
    subscribers,
    debugKeystrokeLogging,
  ]);

  return (
    <KeypressContext.Provider value={{ subscribe, unsubscribe }}>
      {children}
    </KeypressContext.Provider>
  );
}
