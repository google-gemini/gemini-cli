/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, type Config } from '@google/gemini-cli-core';
import { useStdin } from 'ink';
import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from 'react';

import { ESC } from '../utils/input.js';
import { parseMouseEvent } from '../utils/mouse.js';
import { FOCUS_IN, FOCUS_OUT } from '../hooks/useFocus.js';

export const BACKSLASH_ENTER_TIMEOUT = 5;
export const ESC_TIMEOUT = 50;
export const PASTE_TIMEOUT = 50;

const kUTF16SurrogateThreshold = 0x10000; // 2 ** 16
function charLengthAt(str: string, i: number): number {
  if (str.length <= i) {
    // Pretend to move to the right. This is necessary to autocomplete while
    // moving to the right.
    return 1;
  }
  const code = str.codePointAt(i);
  return code !== undefined && code >= kUTF16SurrogateThreshold ? 2 : 1;
}

const MAC_ALT_KEY_CHARACTER_MAP: Record<string, string> = {
  '\u222B': 'b', // "∫" back one word
  '\u0192': 'f', // "ƒ" forward one word
  '\u00B5': 'm', // "µ" toggle markup view
};

function nonKeyboardEventFilter(
  keypressHandler: KeypressHandler,
): KeypressHandler {
  return (key: Key) => {
    if (
      !parseMouseEvent(key.sequence) &&
      key.sequence !== FOCUS_IN &&
      key.sequence !== FOCUS_OUT
    ) {
      keypressHandler(key);
    }
  };
}

/**
 * Buffers "/" keys to see if they are followed return.
 * Will flush the buffer if no data is received for DRAG_COMPLETION_TIMEOUT_MS
 * or when a null key is received.
 */
function bufferBackslashEnter(
  keypressHandler: KeypressHandler,
): (key: Key | null) => void {
  const bufferer = (function* (): Generator<void, void, Key | null> {
    while (true) {
      const key = yield;

      if (key == null) {
        continue;
      } else if (key.sequence !== '\\') {
        keypressHandler(key);
        continue;
      }

      const timeoutId = setTimeout(
        () => bufferer.next(null),
        BACKSLASH_ENTER_TIMEOUT,
      );
      const nextKey = yield;
      clearTimeout(timeoutId);

      if (nextKey === null) {
        keypressHandler(key);
      } else if (nextKey.name === 'return') {
        keypressHandler({
          ...nextKey,
          shift: true,
          sequence: '\r', // Corrected escaping for newline
        });
      } else {
        keypressHandler(key);
        keypressHandler(nextKey);
      }
    }
  })();

  bufferer.next(); // prime the generator so it starts listening.

  return (key: Key | null) => bufferer.next(key);
}

/**
 * Buffers paste events between paste-start and paste-end sequences.
 * Will flush the buffer if no data is received for PASTE_TIMEOUT ms or
 * when a null key is received.
 */
function bufferPaste(
  keypressHandler: KeypressHandler,
): (key: Key | null) => void {
  const bufferer = (function* (): Generator<void, void, Key | null> {
    while (true) {
      let key = yield;

      if (key === null) {
        continue;
      } else if (key.name !== 'paste-start') {
        keypressHandler(key);
        continue;
      }

      let buffer = '';
      while (true) {
        const timeoutId = setTimeout(() => bufferer.next(null), PASTE_TIMEOUT);
        key = yield;
        clearTimeout(timeoutId);

        if (key === null || key.name === 'paste-end') {
          break;
        }
        buffer += key.sequence;
      }

      if (buffer.length > 0) {
        keypressHandler({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: true,
          sequence: buffer,
        });
      }
    }
  })();
  bufferer.next(); // prime the generator so it starts listening.

  return (key: Key | null) => bufferer.next(key);
}

/**
 * Turns raw data strings into keypress events sent to the provided handler.
 * Buffers escape sequences until a full sequence is received or
 * until a timeout occurs.
 */
function createDataListener(keypressHandler: KeypressHandler) {
  const parser = emitKeys(keypressHandler);
  parser.next(); // prime the generator so it starts listening.

  let timeoutId: NodeJS.Timeout;
  return (data: string) => {
    clearTimeout(timeoutId);
    for (const char of data) {
      parser.next(char);
    }
    if (data.length !== 0) {
      timeoutId = setTimeout(() => parser.next(''), ESC_TIMEOUT);
    }
  };
}

/**
 * Translates raw keypress characters into key events.
 * Buffers escape sequences until a full sequence is received or
 * until an empty string is sent to indicate a timeout.
 */
function* emitKeys(
  keypressHandler: KeypressHandler,
): Generator<void, void, string> {
  while (true) {
    let ch = yield;
    let sequence = ch;
    let escaped = false;

    let name = undefined;
    let ctrl = false;
    let meta = false;
    let shift = false;
    let code = undefined;

    if (ch === ESC) {
      escaped = true;
      ch = yield;
      sequence += ch;

      if (ch === ESC) {
        ch = yield;
        sequence += ch;
      }
    }

    if (escaped && (ch === 'O' || ch === '[')) {
      // ANSI escape sequence
      code = ch;
      let modifier = 0;

      if (ch === 'O') {
        // ESC O letter
        // ESC O modifier letter
        ch = yield;
        sequence += ch;

        if (ch >= '0' && ch <= '9') {
          modifier = parseInt(ch, 10) - 1;
          ch = yield;
          sequence += ch;
        }

        code += ch;
      } else if (ch === '[') {
        // ESC [ letter
        // ESC [ modifier letter
        // ESC [ [ modifier letter
        // ESC [ [ num char
        ch = yield;
        sequence += ch;

        if (ch === '[') {
          // \x1b[[A
          //      ^--- escape codes might have a second bracket
          code += ch;
          ch = yield;
          sequence += ch;
        }

        /*
         * Here and later we try to buffer just enough data to get
         * a complete ascii sequence.
         *
         * We have basically two classes of ascii characters to process:
         *
         *
         * 1. `\x1b[24;5~` should be parsed as { code: '[24~', modifier: 5 }
         *
         * This particular example is featuring Ctrl+F12 in xterm.
         *
         *  - `;5` part is optional, e.g. it could be `\x1b[24~`
         *  - first part can contain one or two digits
         *  - there is also special case when there can be 3 digits
         *    but without modifier. They are the case of paste bracket mode
         *
         * So the generic regexp is like /^(?:\d\d?(;\d)?[~^$]|\d{3}~)$/
         *
         *
         * 2. `\x1b[1;5H` should be parsed as { code: '[H', modifier: 5 }
         *
         * This particular example is featuring Ctrl+Home in xterm.
         *
         *  - `1;5` part is optional, e.g. it could be `\x1b[H`
         *  - `1;` part is optional, e.g. it could be `\x1b[5H`
         *
         * So the generic regexp is like /^((\d;)?\d)?[A-Za-z]$/
         *
         */
        const cmdStart = sequence.length - 1;

        // collect as many digits as possible
        while (ch >= '0' && ch <= '9') {
          ch = yield;
          sequence += ch;
        }

        // skip modifier
        if (ch === ';') {
          ch = yield;
          sequence += ch;

          // collect as many digits as possible
          while (ch >= '0' && ch <= '9') {
            ch = yield;
            sequence += ch;
          }
        } else if (ch === '<') {
          // SGR mouse mode
          ch = yield;
          sequence += ch;
          // Don't skip on empty string here to avoid timeouts on slow events.
          while (ch === '' || ch === ';' || (ch >= '0' && ch <= '9')) {
            ch = yield;
            sequence += ch;
          }
        } else if (ch === 'M') {
          // X11 mouse mode
          // three characters after 'M'
          ch = yield;
          sequence += ch;
          ch = yield;
          sequence += ch;
          ch = yield;
          sequence += ch;
        }

        /*
         * We buffered enough data, now trying to extract code
         * and modifier from it
         */
        const cmd = sequence.slice(cmdStart);
        let match;

        if ((match = /^(\d+)(?:;(\d+))?([~^$u])$/.exec(cmd))) {
          code += match[1] + match[3];
          // Defaults to '1' if no modifier exists, resulting in a 0 modifier value
          modifier = parseInt(match[2] ?? '1', 10) - 1;
        } else if ((match = /^((\d;)?(\d))?([A-Za-z])$/.exec(cmd))) {
          code += match[4];
          modifier = parseInt(match[3] ?? '1', 10) - 1;
        } else {
          code += cmd;
        }
      }

      // Parse the key modifier
      ctrl = !!(modifier & 4);
      meta = !!(modifier & 10); // use 10 to catch both alt (2) and meta (8).
      shift = !!(modifier & 1);

      // Parse the key itself
      switch (code) {
        /* paste bracket mode */
        case '[200~':
          name = 'paste-start';
          break;
        case '[201~':
          name = 'paste-end';
          break;

        // from Cygwin and used in libuv
        case '[[A':
          name = 'f1';
          break;
        case '[[B':
          name = 'f2';
          break;
        case '[[C':
          name = 'f3';
          break;
        case '[[D':
          name = 'f4';
          break;
        case '[[E':
          name = 'f5';
          break;

        case '[1~':
          name = 'home';
          break;
        case '[2~':
          name = 'insert';
          break;
        case '[3~':
          name = 'delete';
          break;
        case '[4~':
          name = 'end';
          break;
        case '[5~':
          name = 'pageup';
          break;
        case '[6~':
          name = 'pagedown';
          break;
        case '[7~':
          name = 'home';
          break;
        case '[8~':
          name = 'end';
          break;

        case '[11~':
          name = 'f1';
          break;
        case '[12~':
          name = 'f2';
          break;
        case '[13~':
          name = 'f3';
          break;
        case '[14~':
          name = 'f4';
          break;
        case '[15~':
          name = 'f5';
          break;
        case '[17~':
          name = 'f6';
          break;
        case '[18~':
          name = 'f7';
          break;
        case '[19~':
          name = 'f8';
          break;
        case '[20~':
          name = 'f9';
          break;
        case '[21~':
          name = 'f10';
          break;
        case '[23~':
          name = 'f11';
          break;
        case '[24~':
          name = 'f12';
          break;

        // xterm ESC [ letter
        case '[A':
          name = 'up';
          break;
        case '[B':
          name = 'down';
          break;
        case '[C':
          name = 'right';
          break;
        case '[D':
          name = 'left';
          break;
        case '[E':
          name = 'clear';
          break;
        case '[F':
          name = 'end';
          break;
        case '[H':
          name = 'home';
          break;
        case '[P':
          name = 'f1';
          break;
        case '[Q':
          name = 'f2';
          break;
        case '[R':
          name = 'f3';
          break;
        case '[S':
          name = 'f4';
          break;

        // xterm/gnome ESC O letter
        case 'OA':
          name = 'up';
          break;
        case 'OB':
          name = 'down';
          break;
        case 'OC':
          name = 'right';
          break;
        case 'OD':
          name = 'left';
          break;
        case 'OE':
          name = 'clear';
          break;
        case 'OF':
          name = 'end';
          break;
        case 'OH':
          name = 'home';
          break;
        case 'OP':
          name = 'f1';
          break;
        case 'OQ':
          name = 'f2';
          break;
        case 'OR':
          name = 'f3';
          break;
        case 'OS':
          name = 'f4';
          break;

        // putty
        case '[[5~':
          name = 'pageup';
          break;
        case '[[6~':
          name = 'pagedown';
          break;

        // rxvt keys with modifiers
        case '[a':
          name = 'up';
          shift = true;
          break;
        case '[b':
          name = 'down';
          shift = true;
          break;
        case '[c':
          name = 'right';
          shift = true;
          break;
        case '[d':
          name = 'left';
          shift = true;
          break;
        case '[e':
          name = 'clear';
          shift = true;
          break;

        case '[2$':
          name = 'insert';
          shift = true;
          break;
        case '[3$':
          name = 'delete';
          shift = true;
          break;
        case '[5$':
          name = 'pageup';
          shift = true;
          break;
        case '[6$':
          name = 'pagedown';
          shift = true;
          break;
        case '[7$':
          name = 'home';
          shift = true;
          break;
        case '[8$':
          name = 'end';
          shift = true;
          break;

        case 'Oa':
          name = 'up';
          ctrl = true;
          break;
        case 'Ob':
          name = 'down';
          ctrl = true;
          break;
        case 'Oc':
          name = 'right';
          ctrl = true;
          break;
        case 'Od':
          name = 'left';
          ctrl = true;
          break;
        case 'Oe':
          name = 'clear';
          ctrl = true;
          break;

        case '[2^':
          name = 'insert';
          ctrl = true;
          break;
        case '[3^':
          name = 'delete';
          ctrl = true;
          break;
        case '[5^':
          name = 'pageup';
          ctrl = true;
          break;
        case '[6^':
          name = 'pagedown';
          ctrl = true;
          break;
        case '[7^':
          name = 'home';
          ctrl = true;
          break;
        case '[8^':
          name = 'end';
          ctrl = true;
          break;

        // kitty protocol sequences
        case '[9u':
          name = 'tab';
          break;
        case '[13u':
          name = 'return';
          break;
        case '[27u':
          name = 'escape';
          break;
        case '[127u':
          name = 'backspace';
          break;
        case '[57414u': // Numpad Enter
          name = 'return';
          break;

        // misc.
        case '[Z':
          name = 'tab';
          shift = true;
          break;
        default:
          name = 'undefined';
          if ((ctrl || meta) && (code.endsWith('u') || code.endsWith('~'))) {
            // CSI-u or tilde-coded functional keys: ESC [ <code> ; <mods> (u|~)
            const codeNumber = parseInt(code.slice(1, -1), 10);
            if (
              codeNumber >= 'a'.charCodeAt(0) &&
              codeNumber <= 'z'.charCodeAt(0)
            ) {
              name = String.fromCharCode(codeNumber);
            }
          }
          break;
      }
    } else if (ch === '\r') {
      // carriage return
      name = 'return';
      meta = escaped;
    } else if (ch === '\n') {
      // Enter, should have been called linefeed
      name = 'enter';
      meta = escaped;
    } else if (ch === '\t') {
      // tab
      name = 'tab';
      meta = escaped;
    } else if (ch === '\b' || ch === '\x7f') {
      // backspace or ctrl+h
      name = 'backspace';
      meta = escaped;
    } else if (ch === ESC) {
      // escape key
      name = 'escape';
      meta = escaped;
    } else if (ch === ' ') {
      name = 'space';
      meta = escaped;
    } else if (!escaped && ch <= '\x1a') {
      // ctrl+letter
      name = String.fromCharCode(ch.charCodeAt(0) + 'a'.charCodeAt(0) - 1);
      ctrl = true;
    } else if (/^[0-9A-Za-z]$/.exec(ch) !== null) {
      // Letter, number, shift+letter
      name = ch.toLowerCase();
      shift = /^[A-Z]$/.exec(ch) !== null;
      meta = escaped;
    } else if (MAC_ALT_KEY_CHARACTER_MAP[ch] && process.platform === 'darwin') {
      name = MAC_ALT_KEY_CHARACTER_MAP[ch];
      meta = true;
    } else if (sequence === `${ESC}${ESC}`) {
      // Double escape
      name = 'escape';
      meta = true;

      // Emit first escape key here, then continue processing
      keypressHandler({
        name: 'escape',
        ctrl,
        meta,
        shift,
        paste: false,
        sequence: ESC,
      });
    } else if (escaped) {
      // Escape sequence timeout
      name = ch.length ? undefined : 'escape';
      meta = true;
    }

    if (
      (sequence.length !== 0 && (name !== undefined || escaped)) ||
      charLengthAt(sequence, 0) === sequence.length
    ) {
      keypressHandler({
        name: name || '',
        ctrl,
        meta,
        shift,
        paste: false,
        sequence,
      });
    }
    // Unrecognized or broken escape sequence, don't emit anything
  }
}

export interface Key {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  paste: boolean;
  sequence: string;
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
  config,
  debugKeystrokeLogging,
}: {
  children: React.ReactNode;
  config?: Config;
  debugKeystrokeLogging?: boolean;
}) {
  const { stdin, setRawMode } = useStdin();

  const subscribers = useRef<Set<KeypressHandler>>(new Set()).current;
  const subscribe = useCallback(
    (handler: KeypressHandler) => subscribers.add(handler),
    [subscribers],
  );
  const unsubscribe = useCallback(
    (handler: KeypressHandler) => subscribers.delete(handler),
    [subscribers],
  );
  const broadcast = useCallback(
    (key: Key) => subscribers.forEach((handler) => handler(key)),
    [subscribers],
  );

  useEffect(() => {
    const wasRaw = stdin.isRaw;
    if (wasRaw === false) {
      setRawMode(true);
    }

    process.stdin.setEncoding('utf8'); // Make data events emit strings

    const mouseFilterer = nonKeyboardEventFilter(broadcast);
    const backslashBufferer = bufferBackslashEnter(mouseFilterer);
    const pasteBufferer = bufferPaste(backslashBufferer);
    let dataListener = createDataListener(pasteBufferer);

    if (debugKeystrokeLogging) {
      const old = dataListener;
      dataListener = (data: string) => {
        if (data.length > 0) {
          debugLogger.log(`[DEBUG] Raw StdIn: ${JSON.stringify(data)}`);
        }
        old(data);
      };
    }

    stdin.on('data', dataListener);

    return () => {
      // flush buffers by sending null key
      backslashBufferer(null);
      pasteBufferer(null);
      // flush by sending empty string to the data listener
      dataListener('');
      stdin.removeListener('data', dataListener);

      // Restore the terminal to its original state.
      if (wasRaw === false) {
        setRawMode(false);
      }
    };
  }, [stdin, setRawMode, config, debugKeystrokeLogging, broadcast]);

  return (
    <KeypressContext.Provider value={{ subscribe, unsubscribe }}>
      {children}
    </KeypressContext.Provider>
  );
}
