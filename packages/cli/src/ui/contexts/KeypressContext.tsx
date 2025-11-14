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

export const BACKSLASH_ENTER_TIMEOUT = 5;
export const ESC_TIMEOUT = 50;
export const PASTE_TIMEOUT = 10000;

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

/**
 * Helper class to manage an async iterator with timeout capabilities.
 * Allows "peeking" or waiting for the next value with a timeout,
 * without consuming the value if the timeout occurs.
 */
class AsyncStream<T> {
  private iterator: AsyncIterator<T>;
  private pending: Promise<IteratorResult<T>> | null = null;

  constructor(iterable: AsyncIterable<T>) {
    this.iterator = iterable[Symbol.asyncIterator]();
  }

  /**
   * Gets the next value from the stream.
   */
  async next(): Promise<IteratorResult<T>> {
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      return p;
    }
    return this.iterator.next();
  }

  /**
   * Waits for the next value or a timeout.
   * If the timeout occurs, the next value is NOT consumed and will be returned
   * by the next call to `next()` or `nextOrTimeout()`.
   */
  async nextOrTimeout<U>(
    ms: number,
    timeoutValue: U,
  ): Promise<IteratorResult<T> | { timeout: true; value: U }> {
    if (!this.pending) {
      this.pending = this.iterator.next();
    }

    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<{ timeout: true; value: U }>(
      (resolve) => {
        timer = setTimeout(
          () => resolve({ timeout: true, value: timeoutValue }),
          ms,
        );
      },
    );

    const result = await Promise.race([this.pending, timeoutPromise]);

    clearTimeout(timer!);

    if ('timeout' in result && result.timeout) {
      return result;
    } else {
      this.pending = null;
      return result as IteratorResult<T>;
    }
  }
}

/**
 * Converts stdin data events into an async iterable of characters.
 */
async function* stdinToAsyncIterator(
  stdin: NodeJS.ReadStream,
): AsyncGenerator<string> {
  const queue: string[] = [];
  let resolve: (() => void) | null = null;
  let error: Error | null = null;
  let done = false;

  const onData = (data: Buffer | string) => {
    const str = data.toString();
    for (const char of str) {
      queue.push(char);
    }
    if (resolve) {
      const r = resolve;
      resolve = null;
      r();
    }
  };

  const onEnd = () => {
    done = true;
    if (resolve) {
      const r = resolve;
      resolve = null;
      r();
    }
  };

  const onError = (err: Error) => {
    error = err;
    if (resolve) {
      const r = resolve;
      resolve = null;
      r();
    }
  };

  stdin.on('data', onData);
  stdin.on('end', onEnd);
  stdin.on('error', onError);

  try {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }

      if (error) throw error;
      if (done) return;

      await new Promise<void>((r) => (resolve = r));
    }
  } finally {
    stdin.off('data', onData);
    stdin.off('end', onEnd);
    stdin.off('error', onError);
  }
}

/**
 * Buffers "/" keys to see if they are followed return.
 */
async function* bufferBackslashEnter(
  keyStream: AsyncIterable<Key>,
): AsyncGenerator<Key> {
  const stream = new AsyncStream(keyStream);

  while (true) {
    const result = await stream.next();
    if (result.done) break;
    const key = result.value;

    if (key.sequence !== '\\') {
      yield key;
      continue;
    }

    // We got backslash. Wait for next key or timeout.
    const nextResult = await stream.nextOrTimeout(
      BACKSLASH_ENTER_TIMEOUT,
      null,
    );

    if ('timeout' in nextResult) {
      // Timeout occurred, yield the original backslash
      yield key;
    } else if (nextResult.done) {
      yield key;
      break;
    } else {
      const nextKey = nextResult.value;
      if (nextKey.name === 'return') {
        yield {
          ...nextKey,
          shift: true,
          sequence: '\r', // Corrected escaping for newline
        };
      } else {
        yield key;
        yield nextKey;
      }
    }
  }
}

/**
 * Buffers paste events between paste-start and paste-end sequences.
 */
async function* bufferPaste(
  keyStream: AsyncIterable<Key>,
): AsyncGenerator<Key> {
  const stream = new AsyncStream(keyStream);

  while (true) {
    const result = await stream.next();
    if (result.done) break;
    let key = result.value;

    if (key.name !== 'paste-start') {
      yield key;
      continue;
    }

    let buffer = '';
    while (true) {
      const nextResult = await stream.nextOrTimeout(PASTE_TIMEOUT, null);

      if ('timeout' in nextResult) {
        appEvents.emit(AppEvent.PasteTimeout);
        break;
      }

      if (nextResult.done) {
        break;
      }

      key = nextResult.value;

      if (key.name === 'paste-end') {
        break;
      }
      buffer += key.sequence;
    }

    if (buffer.length > 0) {
      yield {
        name: '',
        ctrl: false,
        meta: false,
        shift: false,
        paste: true,
        insertable: true,
        sequence: buffer,
      };
    }
  }
}

/**
 * Translates raw keypress characters into key events.
 */
async function* emitKeys(
  charStream: AsyncIterable<string>,
): AsyncGenerator<Key> {
  const stream = new AsyncStream(charStream);

  while (true) {
    const result = await stream.next();
    if (result.done) break;

    let ch = result.value;
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
      const next = await stream.nextOrTimeout(ESC_TIMEOUT, '');
      if ('timeout' in next) {
        ch = '';
      } else if (next.done) {
        ch = '';
      } else {
        ch = next.value;
      }
      sequence += ch;

      if (ch === ESC) {
        const next = await stream.nextOrTimeout(ESC_TIMEOUT, '');
        if ('timeout' in next) {
          ch = '';
        } else if (next.done) {
          ch = '';
        } else {
          ch = next.value;
        }
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
        const next = await stream.nextOrTimeout(ESC_TIMEOUT, '');
        if ('timeout' in next) {
          ch = '';
        } else if (next.done) {
          ch = '';
        } else {
          ch = next.value;
        }
        sequence += ch;

        if (ch >= '0' && ch <= '9') {
          modifier = parseInt(ch, 10) - 1;
          const next = await stream.nextOrTimeout(ESC_TIMEOUT, '');
          if ('timeout' in next) {
            ch = '';
          } else if (next.done) {
            ch = '';
          } else {
            ch = next.value;
          }
          sequence += ch;
        }

        code += ch;
      } else if (ch === '[') {
        // ESC [ letter
        // ESC [ modifier letter
        // ESC [ [ modifier letter
        // ESC [ [ num char
        const next = await stream.nextOrTimeout(ESC_TIMEOUT, '');
        if ('timeout' in next) {
          ch = '';
        } else if (next.done) {
          ch = '';
        } else {
          ch = next.value;
        }
        sequence += ch;

        if (ch === '[') {
          // \x1b[[A
          //      ^--- escape codes might have a second bracket
          code += ch;
          const next = await stream.nextOrTimeout(ESC_TIMEOUT, '');
          if ('timeout' in next) {
            ch = '';
          } else if (next.done) {
            ch = '';
          } else {
            ch = next.value;
          }
          sequence += ch;
        }

        const cmdStart = sequence.length - 1;

        // collect as many digits as possible
        while (ch >= '0' && ch <= '9') {
          const next = await stream.nextOrTimeout(ESC_TIMEOUT, '');
          if ('timeout' in next) {
            ch = '';
          } else if (next.done) {
            ch = '';
          } else {
            ch = next.value;
          }
          sequence += ch;
        }

        // skip modifier
        if (ch === ';') {
          const next = await stream.nextOrTimeout(ESC_TIMEOUT, '');
          if ('timeout' in next) {
            ch = '';
          } else if (next.done) {
            ch = '';
          } else {
            ch = next.value;
          }
          sequence += ch;

          // collect as many digits as possible
          while (ch >= '0' && ch <= '9') {
            const next = await stream.nextOrTimeout(ESC_TIMEOUT, '');
            if ('timeout' in next) {
              ch = '';
            } else if (next.done) {
              ch = '';
            } else {
              ch = next.value;
            }
            sequence += ch;
          }
        } else if (ch === '<') {
          // SGR mouse mode
          const next = await stream.nextOrTimeout(ESC_TIMEOUT, '');
          if ('timeout' in next) {
            ch = '';
          } else if (next.done) {
            ch = '';
          } else {
            ch = next.value;
          }
          sequence += ch;
          // Don't skip on empty string here to avoid timeouts on slow events.
          while (ch === '' || ch === ';' || (ch >= '0' && ch <= '9')) {
            const next = await stream.nextOrTimeout(ESC_TIMEOUT, '');
            if ('timeout' in next) {
              ch = '';
            } else if (next.done) {
              ch = '';
            } else {
              ch = next.value;
            }
            sequence += ch;
          }
        } else if (ch === 'M') {
          // X11 mouse mode
          // three characters after 'M'
          const next1 = await stream.nextOrTimeout(ESC_TIMEOUT, '');
          if ('timeout' in next1) {
            ch = '';
          } else if (next1.done) {
            ch = '';
          } else {
            ch = next1.value;
          }
          sequence += ch;

          const next2 = await stream.nextOrTimeout(ESC_TIMEOUT, '');
          if ('timeout' in next2) {
            ch = '';
          } else if (next2.done) {
            ch = '';
          } else {
            ch = next2.value;
          }
          sequence += ch;

          const next3 = await stream.nextOrTimeout(ESC_TIMEOUT, '');
          if ('timeout' in next3) {
            ch = '';
          } else if (next3.done) {
            ch = '';
          } else {
            ch = next3.value;
          }
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

      const keyInfo = KEY_INFO_MAP[code];
      if (keyInfo) {
        name = keyInfo.name;
        if (keyInfo.shift) {
          shift = true;
        }
        if (keyInfo.ctrl) {
          ctrl = true;
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
      yield {
        name: 'escape',
        ctrl,
        meta,
        shift,
        paste: false,
        insertable: false,
        sequence: ESC,
      };
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
      yield {
        name: name || '',
        ctrl,
        meta,
        shift,
        paste: false,
        insertable,
        sequence,
      };
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

    const abortController = new AbortController();

    const run = async () => {
      let charIterator: AsyncIterable<string> = stdinToAsyncIterator(stdin);

      if (debugKeystrokeLogging) {
        const originalIterator = charIterator;
        charIterator = (async function* () {
          for await (const char of originalIterator) {
            debugLogger.log(`[DEBUG] Raw StdIn: ${JSON.stringify(char)}`);
            yield char;
          }
        })();
      }

      const keyStream = emitKeys(charIterator);
      const pasteStream = bufferPaste(keyStream);
      const finalStream = bufferBackslashEnter(pasteStream);

      try {
        for await (const key of finalStream) {
          if (abortController.signal.aborted) break;

          if (
            !parseMouseEvent(key.sequence) &&
            key.sequence !== FOCUS_IN &&
            key.sequence !== FOCUS_OUT
          ) {
            broadcast(key);
          }
        }
      } catch (err) {
        // Handle stream errors if necessary
        console.error('Keypress stream error:', err);
      }
    };

    run();

    return () => {
      abortController.abort();
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
