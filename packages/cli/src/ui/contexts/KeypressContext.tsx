/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';
import {
  debugLogger,
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
  KITTY_MODIFIER_BASE,
  KITTY_MODIFIER_EVENT_TYPES_OFFSET,
  MODIFIER_SHIFT_BIT,
  MODIFIER_ALT_BIT,
  MODIFIER_CTRL_BIT,
} from '../utils/platformConstants.js';

import { FOCUS_IN, FOCUS_OUT } from '../hooks/useFocus.js';

const ESC = '\u001B';
export const PASTE_MODE_START = `${ESC}[200~`;
export const PASTE_MODE_END = `${ESC}[201~`;
export const DRAG_COMPLETION_TIMEOUT_MS = 100; // Broadcast full path after 100ms if no more input
export const KITTY_SEQUENCE_TIMEOUT_MS = 50; // Flush incomplete kitty sequences after 50ms
export const PASTE_CODE_TIMEOUT_MS = 50; // Flush incomplete paste code after 50ms
export const SINGLE_QUOTE = "'";
export const DOUBLE_QUOTE = '"';

// On Mac, hitting alt+char will yield funny characters.
// Remap these three since we listen for them.
const MAC_ALT_KEY_CHARACTER_MAP: Record<string, string> = {
  '\u222B': 'b', // "∫" back one word
  '\u0192': 'f', // "ƒ" forward one word
  '\u00B5': 'm', // "µ" toggle markup view
};

/**
 * Check if a buffer could potentially be a valid kitty sequence or its prefix.
 */
function couldBeKittySequence(buffer: string): boolean {
  // Kitty sequences always start with ESC[.
  if (buffer.length === 0) return true;
  if (buffer === ESC || buffer === `${ESC}[`) return true;

  if (!buffer.startsWith(`${ESC}[`)) return false;

  // Check for known kitty sequence patterns:
  // 1. ESC[<digit> - could be CSI-u or tilde-coded
  // 2. ESC[1;<digit> - parameterized functional
  // 3. ESC[<letter> - legacy functional keys
  // 4. ESC[Z - reverse tab
  const afterCSI = buffer.slice(2);

  // Check if it starts with a digit (could be CSI-u or parameterized)
  if (/^\d/.test(afterCSI)) return true;

  // Check for known single-letter sequences
  if (/^[ABCDHFPQRSZ]/.test(afterCSI)) return true;

  // Check for 1; pattern (parameterized sequences)
  if (/^1;\d/.test(afterCSI)) return true;

  // Anything else starting with ESC[ that doesn't match our patterns
  // is likely not a kitty sequence we handle
  return false;
}

/**
 * Parses a single complete kitty/parameterized/legacy sequence from the start
 * of the buffer.
 *
 * This enables peel-and-continue parsing for batched input, allowing us to
 * "peel off" one complete event when multiple sequences arrive in a single
 * chunk, preventing buffer overflow and fragmentation.
 *
 * @param buffer - The input buffer string to parse.
 * @returns The parsed Key and the number of characters consumed, or null if
 * no complete sequence is found at the start of the buffer.
 */
function parseKittyPrefix(buffer: string): { key: Key; length: number } | null {
  // In older terminals ESC [ Z was used as Cursor Backward Tabulation (CBT)
  // In newer terminals the same functionality of key combination for moving
  // backward through focusable elements is Shift+Tab, hence we will
  // map ESC [ Z to Shift+Tab
  // 0) Reverse Tab (legacy): ESC [ Z
  //    Treat as Shift+Tab for UI purposes.
  //    Regex parts:
  //    ^     - start of buffer
  //    ESC [ - CSI introducer
  //    Z     - legacy reverse tab
  const revTabLegacy = new RegExp(`^${ESC}\\[Z`);
  let m = buffer.match(revTabLegacy);
  if (m) {
    return {
      key: {
        name: 'tab',
        ctrl: false,
        meta: false,
        shift: true,
        paste: false,
        sequence: buffer.slice(0, m[0].length),
        kittyProtocol: true,
      },
      length: m[0].length,
    };
  }

  // 1) Reverse Tab (parameterized): ESC [ 1 ; <mods> Z
  //    Parameterized reverse Tab: ESC [ 1 ; <mods> Z
  const revTabParam = new RegExp(`^${ESC}\\[1;(\\d+)Z`);
  m = buffer.match(revTabParam);
  if (m) {
    let mods = parseInt(m[1], 10);
    if (mods >= KITTY_MODIFIER_EVENT_TYPES_OFFSET) {
      mods -= KITTY_MODIFIER_EVENT_TYPES_OFFSET;
    }
    const bits = mods - KITTY_MODIFIER_BASE;
    const alt = (bits & MODIFIER_ALT_BIT) === MODIFIER_ALT_BIT;
    const ctrl = (bits & MODIFIER_CTRL_BIT) === MODIFIER_CTRL_BIT;
    return {
      key: {
        name: 'tab',
        ctrl,
        meta: alt,
        // Reverse tab implies Shift behavior; force shift regardless of mods
        shift: true,
        paste: false,
        sequence: buffer.slice(0, m[0].length),
        kittyProtocol: true,
      },
      length: m[0].length,
    };
  }

  // 2) Parameterized functional: ESC [ 1 ; <mods> (A|B|C|D|H|F|P|Q|R|S)
  // 2) Parameterized functional: ESC [ 1 ; <mods> (A|B|C|D|H|F|P|Q|R|S)
  //    Arrows, Home/End, F1–F4 with modifiers encoded in <mods>.
  const arrowPrefix = new RegExp(`^${ESC}\\[1;(\\d+)([ABCDHFPQSR])`);
  m = buffer.match(arrowPrefix);
  if (m) {
    let mods = parseInt(m[1], 10);
    if (mods >= KITTY_MODIFIER_EVENT_TYPES_OFFSET) {
      mods -= KITTY_MODIFIER_EVENT_TYPES_OFFSET;
    }
    const bits = mods - KITTY_MODIFIER_BASE;
    const shift = (bits & MODIFIER_SHIFT_BIT) === MODIFIER_SHIFT_BIT;
    const alt = (bits & MODIFIER_ALT_BIT) === MODIFIER_ALT_BIT;
    const ctrl = (bits & MODIFIER_CTRL_BIT) === MODIFIER_CTRL_BIT;
    const sym = m[2];
    const symbolToName: { [k: string]: string } = {
      A: 'up',
      B: 'down',
      C: 'right',
      D: 'left',
      H: 'home',
      F: 'end',
      P: 'f1',
      Q: 'f2',
      R: 'f3',
      S: 'f4',
    };
    const name = symbolToName[sym] || '';
    if (!name) return null;
    return {
      key: {
        name,
        ctrl,
        meta: alt,
        shift,
        paste: false,
        sequence: buffer.slice(0, m[0].length),
        kittyProtocol: true,
      },
      length: m[0].length,
    };
  }

  // 3) CSI-u form: ESC [ <code> ; <mods> (u|~)
  // 3) CSI-u and tilde-coded functional keys: ESC [ <code> ; <mods> (u|~)
  //    'u' terminator: Kitty CSI-u; '~' terminator: tilde-coded function keys.
  const csiUPrefix = new RegExp(`^${ESC}\\[(\\d+)(;(\\d+))?([u~])`);
  m = buffer.match(csiUPrefix);
  if (m) {
    const keyCode = parseInt(m[1], 10);
    let modifiers = m[3] ? parseInt(m[3], 10) : KITTY_MODIFIER_BASE;
    if (modifiers >= KITTY_MODIFIER_EVENT_TYPES_OFFSET) {
      modifiers -= KITTY_MODIFIER_EVENT_TYPES_OFFSET;
    }
    const modifierBits = modifiers - KITTY_MODIFIER_BASE;
    const shift = (modifierBits & MODIFIER_SHIFT_BIT) === MODIFIER_SHIFT_BIT;
    const alt = (modifierBits & MODIFIER_ALT_BIT) === MODIFIER_ALT_BIT;
    const ctrl = (modifierBits & MODIFIER_CTRL_BIT) === MODIFIER_CTRL_BIT;
    const terminator = m[4];

    // Tilde-coded functional keys (Delete, Insert, PageUp/Down, Home/End)
    if (terminator === '~') {
      let name: string | null = null;
      switch (keyCode) {
        case 1:
          name = 'home';
          break;
        case 2:
          name = 'insert';
          break;
        case 3:
          name = 'delete';
          break;
        case 4:
          name = 'end';
          break;
        case 5:
          name = 'pageup';
          break;
        case 6:
          name = 'pagedown';
          break;
        default:
          break;
      }
      if (name) {
        return {
          key: {
            name,
            ctrl,
            meta: alt,
            shift,
            paste: false,
            sequence: buffer.slice(0, m[0].length),
            kittyProtocol: true,
          },
          length: m[0].length,
        };
      }
    }

    const kittyKeyCodeToName: { [key: number]: string } = {
      [CHAR_CODE_ESC]: 'escape',
      [KITTY_KEYCODE_TAB]: 'tab',
      [KITTY_KEYCODE_BACKSPACE]: 'backspace',
      [KITTY_KEYCODE_ENTER]: 'return',
      [KITTY_KEYCODE_NUMPAD_ENTER]: 'return',
    };

    const name = kittyKeyCodeToName[keyCode];
    if (name) {
      return {
        key: {
          name,
          ctrl,
          meta: alt,
          shift,
          paste: false,
          sequence: buffer.slice(0, m[0].length),
          kittyProtocol: true,
        },
        length: m[0].length,
      };
    }

    // Ctrl+letters and Alt+letters
    if (
      (ctrl || alt) &&
      keyCode >= 'a'.charCodeAt(0) &&
      keyCode <= 'z'.charCodeAt(0)
    ) {
      const letter = String.fromCharCode(keyCode);
      return {
        key: {
          name: letter,
          ctrl,
          meta: alt,
          shift,
          paste: false,
          sequence: buffer.slice(0, m[0].length),
          kittyProtocol: true,
        },
        length: m[0].length,
      };
    }
  }

  // 4) Legacy function keys (no parameters): ESC [ (A|B|C|D|H|F)
  //    Arrows + Home/End without modifiers.
  const legacyFuncKey = new RegExp(`^${ESC}\\[([ABCDHF])`);
  m = buffer.match(legacyFuncKey);
  if (m) {
    const sym = m[1];
    const nameMap: { [key: string]: string } = {
      A: 'up',
      B: 'down',
      C: 'right',
      D: 'left',
      H: 'home',
      F: 'end',
    };
    const name = nameMap[sym]!;
    return {
      key: {
        name,
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: buffer.slice(0, m[0].length),
        kittyProtocol: true,
      },
      length: m[0].length,
    };
  }

  return null;
}

/**
 * Returns the first index before which we are certain there is no paste marker.
 */
function earliestPossiblePasteMarker(data: string): number {
  // Check data for full start-paste or end-paste markers.
  const startIndex = data.indexOf(PASTE_MODE_START);
  const endIndex = data.indexOf(PASTE_MODE_END);
  if (startIndex !== -1 && endIndex !== -1) {
    return Math.min(startIndex, endIndex);
  } else if (startIndex !== -1) {
    return startIndex;
  } else if (endIndex !== -1) {
    return endIndex;
  }

  // data contains no full start-paste or end-paste.
  // Check if data ends with a prefix of start-paste or end-paste.
  const codeLength = PASTE_MODE_START.length;
  for (let i = Math.min(data.length, codeLength - 1); i > 0; i--) {
    const candidate = data.slice(data.length - i);
    if (
      PASTE_MODE_START.indexOf(candidate) === 0 ||
      PASTE_MODE_END.indexOf(candidate) === 0
    ) {
      return data.length - i;
    }
  }
  return data.length;
}

/**
 * A generator that takes in data chunks and spits out paste-start and
 * paste-end keypresses. All non-paste marker data is passed to passthrough.
 */
function* pasteMarkerParser(
  passthrough: PassThrough,
  keypressHandler: (_: unknown, key: Key) => void,
): Generator<void, void, string> {
  while (true) {
    let data = yield;
    if (data.length === 0) {
      continue; // we timed out
    }

    while (true) {
      const index = earliestPossiblePasteMarker(data);
      if (index === data.length) {
        // no possible paste markers were found
        passthrough.write(data);
        break;
      }
      if (index > 0) {
        // snip off and send the part that doesn't have a paste marker
        passthrough.write(data.slice(0, index));
        data = data.slice(index);
      }
      // data starts with a possible paste marker
      const codeLength = PASTE_MODE_START.length;
      if (data.length < codeLength) {
        // we have a prefix. Concat the next data and try again.
        const newData = yield;
        if (newData.length === 0) {
          // we timed out. Just dump what we have and start over.
          passthrough.write(data);
          break;
        }
        data += newData;
      } else if (data.startsWith(PASTE_MODE_START)) {
        keypressHandler(undefined, {
          name: 'paste-start',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: '',
        });
        data = data.slice(PASTE_MODE_START.length);
      } else if (data.startsWith(PASTE_MODE_END)) {
        keypressHandler(undefined, {
          name: 'paste-end',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: '',
        });
        data = data.slice(PASTE_MODE_END.length);
      } else {
        // This should never happen.
        passthrough.write(data);
        break;
      }
    }
  }
}

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

function shouldUsePassthrough(): boolean {
  return process.env['PASTE_WORKAROUND'] !== 'false';
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

    const keypressStream = shouldUsePassthrough() ? new PassThrough() : null;

    // If non-null that means we are in paste mode
    let pasteBuffer: Buffer | null = null;

    // Used to turn "\" quickly followed by a "enter" into a shift enter
    let backslashTimeout: NodeJS.Timeout | null = null;

    // Buffers incomplete Kitty sequences and timer to flush it
    let kittySequenceBuffer = '';
    let kittySequenceTimeout: NodeJS.Timeout | null = null;

    // Used to detect filename drag-and-drops.
    let dragBuffer = '';
    let draggingTimer: NodeJS.Timeout | null = null;

    const clearDraggingTimer = () => {
      if (draggingTimer) {
        clearTimeout(draggingTimer);
        draggingTimer = null;
      }
    };

    const flushKittyBufferOnInterrupt = (reason: string) => {
      if (kittySequenceBuffer) {
        if (debugKeystrokeLogging) {
          debugLogger.log(
            `[DEBUG] Kitty sequence flushed due to ${reason}:`,
            JSON.stringify(kittySequenceBuffer),
          );
        }
        broadcast({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: kittySequenceBuffer,
        });
        kittySequenceBuffer = '';
      }
      if (kittySequenceTimeout) {
        clearTimeout(kittySequenceTimeout);
        kittySequenceTimeout = null;
      }
    };

    const handleKeypress = (_: unknown, key: Key) => {
      if (key.sequence === FOCUS_IN || key.sequence === FOCUS_OUT) {
        flushKittyBufferOnInterrupt('focus event');
        return;
      }
      if (key.name === 'paste-start') {
        flushKittyBufferOnInterrupt('paste start');
        pasteBuffer = Buffer.alloc(0);
        return;
      }
      if (key.name === 'paste-end') {
        if (pasteBuffer !== null) {
          broadcast({
            name: '',
            ctrl: false,
            meta: false,
            shift: false,
            paste: true,
            sequence: pasteBuffer.toString(),
          });
        }
        pasteBuffer = null;
        return;
      }

      if (pasteBuffer !== null) {
        pasteBuffer = Buffer.concat([pasteBuffer, Buffer.from(key.sequence)]);
        return;
      }

      if (
        key.sequence === SINGLE_QUOTE ||
        key.sequence === DOUBLE_QUOTE ||
        draggingTimer !== null
      ) {
        dragBuffer += key.sequence;

        clearDraggingTimer();
        draggingTimer = setTimeout(() => {
          draggingTimer = null;
          const seq = dragBuffer;
          dragBuffer = '';
          if (seq) {
            broadcast({ ...key, name: '', paste: true, sequence: seq });
          }
        }, DRAG_COMPLETION_TIMEOUT_MS);

        return;
      }

      const mappedLetter = MAC_ALT_KEY_CHARACTER_MAP[key.sequence];
      if (process.platform === 'darwin' && mappedLetter && !key.meta) {
        broadcast({
          name: mappedLetter,
          ctrl: false,
          meta: true,
          shift: false,
          paste: pasteBuffer !== null,
          sequence: key.sequence,
        });
        return;
      }

      if (key.name === 'return' && backslashTimeout !== null) {
        clearTimeout(backslashTimeout);
        backslashTimeout = null;
        broadcast({
          ...key,
          shift: true,
          sequence: '\r', // Corrected escaping for newline
        });
        return;
      }

      if (key.sequence === '\\' && !key.name) {
        // Corrected escaping for backslash
        backslashTimeout = setTimeout(() => {
          backslashTimeout = null;
          broadcast(key);
        }, BACKSLASH_ENTER_DETECTION_WINDOW_MS);
        return;
      }

      if (backslashTimeout !== null && key.name !== 'return') {
        clearTimeout(backslashTimeout);
        backslashTimeout = null;
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
          debugLogger.log(
            '[DEBUG] Kitty buffer cleared on Ctrl+C:',
            kittySequenceBuffer,
          );
        }
        kittySequenceBuffer = '';
        if (kittySequenceTimeout) {
          clearTimeout(kittySequenceTimeout);
          kittySequenceTimeout = null;
        }
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
        // Clear any pending timeout when new input arrives
        if (kittySequenceTimeout) {
          clearTimeout(kittySequenceTimeout);
          kittySequenceTimeout = null;
        }

        // Check if this could start a kitty sequence
        const startsWithEsc = key.sequence.startsWith(ESC);
        const isExcluded = [
          PASTE_MODE_START,
          PASTE_MODE_END,
          FOCUS_IN,
          FOCUS_OUT,
        ].some((prefix) => key.sequence.startsWith(prefix));

        if (kittySequenceBuffer || (startsWithEsc && !isExcluded)) {
          kittySequenceBuffer += key.sequence;

          if (debugKeystrokeLogging) {
            debugLogger.log(
              '[DEBUG] Kitty buffer accumulating:',
              JSON.stringify(kittySequenceBuffer),
            );
          }

          // Try immediate parsing
          let remainingBuffer = kittySequenceBuffer;
          let parsedAny = false;

          while (remainingBuffer) {
            const parsed = parseKittyPrefix(remainingBuffer);

            if (parsed) {
              if (debugKeystrokeLogging) {
                const parsedSequence = remainingBuffer.slice(0, parsed.length);
                debugLogger.log(
                  '[DEBUG] Kitty sequence parsed successfully:',
                  JSON.stringify(parsedSequence),
                );
              }
              broadcast(parsed.key);
              remainingBuffer = remainingBuffer.slice(parsed.length);
              parsedAny = true;
            } else {
              // If we can't parse a sequence at the start, check if there's
              // another ESC later in the buffer. If so, the data before it
              // is garbage/incomplete and should be dropped so we can
              // process the next sequence.
              const nextEscIndex = remainingBuffer.indexOf(ESC, 1);
              if (nextEscIndex !== -1) {
                const garbage = remainingBuffer.slice(0, nextEscIndex);
                if (debugKeystrokeLogging) {
                  debugLogger.log(
                    '[DEBUG] Dropping incomplete sequence before next ESC:',
                    JSON.stringify(garbage),
                  );
                }
                // Drop garbage and continue parsing from next ESC
                remainingBuffer = remainingBuffer.slice(nextEscIndex);
                // We made progress, so we can continue the loop to parse the next sequence
                continue;
              }

              // Check if buffer could become a valid kitty sequence
              const couldBeValid = couldBeKittySequence(remainingBuffer);

              if (!couldBeValid) {
                // Not a kitty sequence - flush as regular input immediately
                if (debugKeystrokeLogging) {
                  debugLogger.log(
                    '[DEBUG] Not a kitty sequence, flushing:',
                    JSON.stringify(remainingBuffer),
                  );
                }
                broadcast({
                  name: '',
                  ctrl: false,
                  meta: false,
                  shift: false,
                  paste: false,
                  sequence: remainingBuffer,
                });
                remainingBuffer = '';
                parsedAny = true;
              } else if (remainingBuffer.length > MAX_KITTY_SEQUENCE_LENGTH) {
                // Buffer overflow - log and clear
                if (debugKeystrokeLogging) {
                  debugLogger.log(
                    '[DEBUG] Kitty buffer overflow, clearing:',
                    JSON.stringify(remainingBuffer),
                  );
                }
                if (config) {
                  const event = new KittySequenceOverflowEvent(
                    remainingBuffer.length,
                    remainingBuffer,
                  );
                  logKittySequenceOverflow(config, event);
                }
                // Flush as regular input
                broadcast({
                  name: '',
                  ctrl: false,
                  meta: false,
                  shift: false,
                  paste: false,
                  sequence: remainingBuffer,
                });
                remainingBuffer = '';
                parsedAny = true;
              } else {
                if (config?.getDebugMode() || debugKeystrokeLogging) {
                  debugLogger.warn(
                    'Kitty sequence buffer has content:',
                    JSON.stringify(kittySequenceBuffer),
                  );
                }
                // Could be valid but incomplete - set timeout
                kittySequenceTimeout = setTimeout(() => {
                  if (kittySequenceBuffer) {
                    if (debugKeystrokeLogging) {
                      debugLogger.log(
                        '[DEBUG] Kitty sequence timeout, flushing:',
                        JSON.stringify(kittySequenceBuffer),
                      );
                    }
                    broadcast({
                      name: '',
                      ctrl: false,
                      meta: false,
                      shift: false,
                      paste: false,
                      sequence: kittySequenceBuffer,
                    });
                    kittySequenceBuffer = '';
                  }
                  kittySequenceTimeout = null;
                }, KITTY_SEQUENCE_TIMEOUT_MS);
                break;
              }
            }
          }

          kittySequenceBuffer = remainingBuffer;
          if (parsedAny || kittySequenceBuffer) return;
        }
      }

      if (key.name === 'return' && key.sequence === `${ESC}\r`) {
        key.meta = true;
      }
      broadcast({ ...key, paste: pasteBuffer !== null });
    };

    let cleanup = () => {};
    let rl: readline.Interface;
    if (keypressStream !== null) {
      rl = readline.createInterface({
        input: keypressStream,
        escapeCodeTimeout: 0,
      });
      readline.emitKeypressEvents(keypressStream, rl);

      const parser = pasteMarkerParser(keypressStream, handleKeypress);
      parser.next(); // prime the generator so it starts listening.
      let timeoutId: NodeJS.Timeout;
      const handleRawKeypress = (data: string) => {
        clearTimeout(timeoutId);
        parser.next(data);
        timeoutId = setTimeout(() => parser.next(''), PASTE_CODE_TIMEOUT_MS);
      };

      keypressStream.on('keypress', handleKeypress);
      process.stdin.setEncoding('utf8'); // so handleRawKeypress gets strings
      stdin.on('data', handleRawKeypress);

      cleanup = () => {
        keypressStream.removeListener('keypress', handleKeypress);
        stdin.removeListener('data', handleRawKeypress);
      };
    } else {
      rl = readline.createInterface({ input: stdin, escapeCodeTimeout: 0 });
      readline.emitKeypressEvents(stdin, rl);

      stdin.on('keypress', handleKeypress);

      cleanup = () => stdin.removeListener('keypress', handleKeypress);
    }

    return () => {
      cleanup();
      rl.close();

      // Restore the terminal to its original state.
      if (wasRaw === false) {
        setRawMode(false);
      }

      if (backslashTimeout) {
        clearTimeout(backslashTimeout);
        backslashTimeout = null;
      }

      if (kittySequenceTimeout) {
        clearTimeout(kittySequenceTimeout);
        kittySequenceTimeout = null;
      }

      // Flush any pending kitty sequence data to avoid data loss on exit.
      if (kittySequenceBuffer) {
        broadcast({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: kittySequenceBuffer,
        });
        kittySequenceBuffer = '';
      }

      // Flush any pending paste data to avoid data loss on exit.
      if (pasteBuffer !== null) {
        broadcast({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: true,
          sequence: pasteBuffer.toString(),
        });
        pasteBuffer = null;
      }

      clearDraggingTimer();
      if (dragBuffer) {
        broadcast({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: true,
          sequence: dragBuffer,
        });
        dragBuffer = '';
      }
    };
  }, [
    stdin,
    setRawMode,
    kittyProtocolEnabled,
    config,
    debugKeystrokeLogging,
    broadcast,
  ]);

  return (
    <KeypressContext.Provider value={{ subscribe, unsubscribe }}>
      {children}
    </KeypressContext.Provider>
  );
}
