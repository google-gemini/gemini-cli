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
import { appEvents, AppEvent } from '../../utils/events.js';
import { terminalCapabilityManager } from '../utils/terminalCapabilityManager.js';

export const BACKSLASH_ENTER_TIMEOUT = 5;
export const ESC_TIMEOUT = 50;
export const PASTE_TIMEOUT = 30_000;
export const FAST_RETURN_TIMEOUT = 30;

// Parse the key itself
const KEY_INFO_MAP: Record<
  string,
  { name: string; shift?: boolean; ctrl?: boolean }
> = {
  '[200~': { name: 'paste-start' },
  '[201~': { name: 'paste-end' },
  '[[A': { name: 'f1' },
  '[[B': { name: 'f2' },
  '[[C': { name: 'f3' },
  '[[D': { name: 'f4' },
  '[[E': { name: 'f5' },
  '[1~': { name: 'home' },
  '[2~': { name: 'insert' },
  '[3~': { name: 'delete' },
  '[4~': { name: 'end' },
  '[5~': { name: 'pageup' },
  '[6~': { name: 'pagedown' },
  '[7~': { name: 'home' },
  '[8~': { name: 'end' },
  '[11~': { name: 'f1' },
  '[12~': { name: 'f2' },
  '[13~': { name: 'f3' },
  '[14~': { name: 'f4' },
  '[15~': { name: 'f5' },
  '[17~': { name: 'f6' },
  '[18~': { name: 'f7' },
  '[19~': { name: 'f8' },
  '[20~': { name: 'f9' },
  '[21~': { name: 'f10' },
  '[23~': { name: 'f11' },
  '[24~': { name: 'f12' },
  '[A': { name: 'up' },
  '[B': { name: 'down' },
  '[C': { name: 'right' },
  '[D': { name: 'left' },
  '[E': { name: 'clear' },
  '[F': { name: 'end' },
  '[H': { name: 'home' },
  '[P': { name: 'f1' },
  '[Q': { name: 'f2' },
  '[R': { name: 'f3' },
  '[S': { name: 'f4' },
  OA: { name: 'up' },
  OB: { name: 'down' },
  OC: { name: 'right' },
  OD: { name: 'left' },
  OE: { name: 'clear' },
  OF: { name: 'end' },
  OH: { name: 'home' },
  OP: { name: 'f1' },
  OQ: { name: 'f2' },
  OR: { name: 'f3' },
  OS: { name: 'f4' },
  '[[5~': { name: 'pageup' },
  '[[6~': { name: 'pagedown' },
  '[9u': { name: 'tab' },
  '[13u': { name: 'return' },
  '[27u': { name: 'escape' },
  '[32u': { name: 'space' },
  '[127u': { name: 'backspace' },
  '[57414u': { name: 'return' }, // Numpad Enter
  '[a': { name: 'up', shift: true },
  '[b': { name: 'down', shift: true },
  '[c': { name: 'right', shift: true },
  '[d': { name: 'left', shift: true },
  '[e': { name: 'clear', shift: true },
  '[2$': { name: 'insert', shift: true },
  '[3$': { name: 'delete', shift: true },
  '[5$': { name: 'pageup', shift: true },
  '[6$': { name: 'pagedown', shift: true },
  '[7$': { name: 'home', shift: true },
  '[8$': { name: 'end', shift: true },
  '[Z': { name: 'tab', shift: true },
  Oa: { name: 'up', ctrl: true },
  Ob: { name: 'down', ctrl: true },
  Oc: { name: 'right', ctrl: true },
  Od: { name: 'left', ctrl: true },
  Oe: { name: 'clear', ctrl: true },
  '[2^': { name: 'insert', ctrl: true },
  '[3^': { name: 'delete', ctrl: true },
  '[5^': { name: 'pageup', ctrl: true },
  '[6^': { name: 'pagedown', ctrl: true },
  '[7^': { name: 'home', ctrl: true },
  '[8^': { name: 'end', ctrl: true },
};

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
 * Converts return keys pressed quickly after other keys into plain
 * insertable return characters.
 *
 * This is to accommodate older terminals that paste text without bracketing.
 */
function bufferFastReturn(keypressHandler: KeypressHandler): KeypressHandler {
  let lastKeyTime = 0;
  return (key: Key) => {
    const now = Date.now();
    if (key.name === 'return' && now - lastKeyTime <= FAST_RETURN_TIMEOUT) {
      keypressHandler({
        ...key,
        name: 'return',
        sequence: '\r',
        insertable: true,
      });
    } else {
      keypressHandler(key);
    }
    lastKeyTime = now;
  };
}

/**
 * Buffers "/" keys to see if they are followed return.
 * Will flush the buffer if no data is received for DRAG_COMPLETION_TIMEOUT_MS
 * or when a null key is received.
 */
function bufferBackslashEnter(
  keypressHandler: KeypressHandler,
): KeypressHandler {
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

  return (key: Key) => bufferer.next(key);
}

/**
 * Buffers paste events between paste-start and paste-end sequences.
 * Will flush the buffer if no data is received for PASTE_TIMEOUT ms or
 * when a null key is received.
 */
function bufferPaste(keypressHandler: KeypressHandler): KeypressHandler {
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

        if (key === null) {
          appEvents.emit(AppEvent.PasteTimeout);
          break;
        }

        if (key.name === 'paste-end') {
          break;
        }
        buffer += key.sequence;
      }

      if (buffer.length > 0) {
        keypressHandler({
          name: 'paste',
          ctrl: false,
          meta: false,
          shift: false,
          insertable: true,
          sequence: buffer,
        });
      }
    }
  })();
  bufferer.next(); // prime the generator so it starts listening.

  return (key: Key) => bufferer.next(key);
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
    let insertable = false;

    if (ch === ESC) {
      escaped = true;
      ch = yield;
      sequence += ch;

      if (ch === ESC) {
        ch = yield;
        sequence += ch;
      }
    }

    if (escaped && (ch === 'O' || ch === '[' || ch === ']')) {
      // ANSI escape sequence
      code = ch;
      let modifier = 0;

      if (ch === ']') {
        // OSC sequence
        // ESC ] <params> ; <data> BEL
        // ESC ] <params> ; <data> ESC \
        let buffer = '';

        // Read until BEL, `ESC \`, or timeout (empty string)
        while (true) {
          const next = yield;
          if (next === '' || next === '\u0007') {
            break;
          } else if (next === ESC) {
            const afterEsc = yield;
            if (afterEsc === '' || afterEsc === '\\') {
              break;
            }
            buffer += next + afterEsc;
            continue;
          }
          buffer += next;
        }

        // Check for OSC 52 (Clipboard) response
        // Format: 52;c;<base64> or 52;p;<base64>
        const match = /^52;[cp];(.*)$/.exec(buffer);
        if (match) {
          try {
            const base64Data = match[1];
            const decoded = Buffer.from(base64Data, 'base64').toString('utf-8');
            keypressHandler({
              name: 'paste',
              ctrl: false,
              meta: false,
              shift: false,
              insertable: true,
              sequence: decoded,
            });
          } catch (_e) {
            debugLogger.log('Failed to decode OSC 52 clipboard data');
          }
        }

        continue; // resume main loop
      } else if (ch === 'O') {
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
          while (ch === ';') {
            ch = yield;
            sequence += ch;

            // collect as many digits as possible
            while (ch >= '0' && ch <= '9') {
              ch = yield;
              sequence += ch;
            }
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

        if ((match = /^(\d+)(?:;(\d+))?(?:;(\d+))?([~^$u])$/.exec(cmd))) {
          if (match[1] === '27' && match[3] && match[4] === '~') {
            // modifyOtherKeys format: CSI 27 ; modifier ; key ~
            // Treat as CSI u: key + 'u'
            code += match[3] + 'u';
            modifier = parseInt(match[2] ?? '1', 10) - 1;
          } else {
            code += match[1] + match[4];
            // Defaults to '1' if no modifier exists, resulting in a 0 modifier value
            modifier = parseInt(match[2] ?? '1', 10) - 1;
          }
        } else if ((match = /^(\d+)?(?:;(\d+))?([A-Za-z])$/.exec(cmd))) {
          code += match[3];
          modifier = parseInt(match[2] ?? match[1] ?? '1', 10) - 1;
        } else {
          code += cmd;
        }
      }

      // Parse the key modifier
      ctrl = !!(modifier & 4);
      meta = !!(modifier & 10); // use 10 to catch both alt (2) and meta (8).
      shift = !!(modifier & 1);

      const keyInfo = KEY_INFO_MAP[code];
      if (keyInfo) {
        name = keyInfo.name;
        if (keyInfo.shift) {
          shift = true;
        }
        if (keyInfo.ctrl) {
          ctrl = true;
        }
        if (name === 'space' && !ctrl && !meta) {
          sequence = ' ';
          insertable = true;
        }
      } else {
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
      insertable = true;
    } else if (!escaped && ch <= '\x1a') {
      // ctrl+letter
      name = String.fromCharCode(ch.charCodeAt(0) + 'a'.charCodeAt(0) - 1);
      ctrl = true;
    } else if (/^[0-9A-Za-z]$/.exec(ch) !== null) {
      // Letter, number, shift+letter
      name = ch.toLowerCase();
      shift = /^[A-Z]$/.exec(ch) !== null;
      meta = escaped;
      insertable = true;
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
        insertable: false,
        sequence: ESC,
      });
    } else if (escaped) {
      // Escape sequence timeout
      name = ch.length ? undefined : 'escape';
      meta = true;
    } else {
      // Any other character is considered printable.
      insertable = true;
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
        insertable,
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
  insertable: boolean;
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

    let processor = nonKeyboardEventFilter(broadcast);
    if (!terminalCapabilityManager.isKittyProtocolEnabled()) {
      processor = bufferFastReturn(processor);
    }
    processor = bufferBackslashEnter(processor);
    processor = bufferPaste(processor);
    let dataListener = createDataListener(processor);

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
      stdin.removeListener('data', dataListener);
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
