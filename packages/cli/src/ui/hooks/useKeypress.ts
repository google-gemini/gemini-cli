/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { useStdin } from 'ink';
import readline from 'readline';
import { PassThrough } from 'stream';
import {
  KITTY_CTRL_C,
  BACKSLASH_ENTER_DETECTION_WINDOW_MS,
  MAX_KITTY_SEQUENCE_LENGTH,
} from '../utils/platformConstants.js';
import {
  KittySequenceOverflowEvent,
  logKittySequenceOverflow,
  Config,
} from '@google/gemini-cli-core';
import { FOCUS_IN, FOCUS_OUT } from './useFocus.js';

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

/**
 * A hook that listens for keypress events from stdin, providing a
 * key object that mirrors the one from Node's `readline` module,
 * adding a 'paste' flag for characters input as part of a bracketed
 * paste (when enabled).
 *
 * Pastes are currently sent as a single key event where the full paste
 * is in the sequence field.
 *
 * @param onKeypress - The callback function to execute on each keypress.
 * @param options - Options to control the hook's behavior.
 * @param options.isActive - Whether the hook should be actively listening for input.
 * @param options.kittyProtocolEnabled - Whether Kitty keyboard protocol is enabled.
 * @param options.config - Optional config for telemetry logging.
 */
export function useKeypress(
  onKeypress: (key: Key) => void,
  {
    isActive,
    kittyProtocolEnabled = false,
    config,
  }: { isActive: boolean; kittyProtocolEnabled?: boolean; config?: Config },
) {
  const { stdin, setRawMode } = useStdin();
  const onKeypressRef = useRef(onKeypress);

  useEffect(() => {
    onKeypressRef.current = onKeypress;
  }, [onKeypress]);

  useEffect(() => {
    if (!isActive || !stdin.isTTY) {
      return;
    }

    setRawMode(true);

    const keypressStream = new PassThrough();
    let usePassthrough = false;
    const nodeMajorVersion = parseInt(process.versions.node.split('.')[0], 10);
    if (
      nodeMajorVersion < 20 ||
      process.env['PASTE_WORKAROUND'] === '1' ||
      process.env['PASTE_WORKAROUND'] === 'true'
    ) {
      // Prior to node 20, node's built-in readline does not support bracketed
      // paste mode. We hack by detecting it with our own handler.
      usePassthrough = true;
    }

    let isPaste = false;
    let pasteBuffer = Buffer.alloc(0);
    let kittySequenceBuffer = '';
    let backslashTimeout: NodeJS.Timeout | null = null;
    let waitingForEnterAfterBackslash = false;

    // Parse Kitty protocol sequences
    const parseKittySequence = (sequence: string): Key | null => {
      // Match CSI <number> ; <modifiers> u or ~
      // Format: ESC [ <keycode> ; <modifiers> u/~
      const kittyPattern = new RegExp(`^${ESC}\\[(\\d+)(;(\\d+))?([u~])$`);
      const match = sequence.match(kittyPattern);
      if (!match) return null;

      const keyCode = parseInt(match[1], 10);
      const modifiers = match[3] ? parseInt(match[3], 10) : 1;

      // Decode modifiers (subtract 1 as per Kitty protocol spec)
      const modifierBits = modifiers - 1;
      const shift = (modifierBits & 1) === 1;
      const alt = (modifierBits & 2) === 2;
      const ctrl = (modifierBits & 4) === 4;

      // Handle Escape key (code 27)
      if (keyCode === 27) {
        return {
          name: 'escape',
          ctrl,
          meta: alt,
          shift,
          paste: false,
          sequence,
          kittyProtocol: true,
        };
      }

      // Handle Enter key (code 13)
      if (keyCode === 13) {
        return {
          name: 'return',
          ctrl,
          meta: alt,
          shift,
          paste: false,
          sequence,
          kittyProtocol: true,
        };
      }

      // Handle Ctrl+letter combinations (a-z)
      // ASCII codes: a=97, b=98, c=99, ..., z=122
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

      // Handle other keys as needed
      return null;
    };

    const handleKeypress = (_: unknown, key: Key) => {
      // Handle VS Code's backslash+return pattern (Shift+Enter)
      if (key.name === 'return' && waitingForEnterAfterBackslash) {
        // Cancel the timeout since we got the Enter
        if (backslashTimeout) {
          clearTimeout(backslashTimeout);
          backslashTimeout = null;
        }
        waitingForEnterAfterBackslash = false;

        // Convert to Shift+Enter
        onKeypressRef.current({
          ...key,
          shift: true,
          sequence: '\\\r', // VS Code's Shift+Enter representation
        });
        return;
      }

      // Handle backslash - hold it to see if Enter follows
      if (key.sequence === '\\' && !key.name) {
        // Don't pass through the backslash yet - wait to see if Enter follows
        waitingForEnterAfterBackslash = true;

        // Set up a timeout to pass through the backslash if no Enter follows
        backslashTimeout = setTimeout(() => {
          waitingForEnterAfterBackslash = false;
          backslashTimeout = null;
          // Pass through the backslash since no Enter followed
          onKeypressRef.current(key);
        }, BACKSLASH_ENTER_DETECTION_WINDOW_MS);

        return;
      }

      // If we're waiting for Enter after backslash but got something else,
      // pass through the backslash first, then the new key
      if (waitingForEnterAfterBackslash && key.name !== 'return') {
        if (backslashTimeout) {
          clearTimeout(backslashTimeout);
          backslashTimeout = null;
        }
        waitingForEnterAfterBackslash = false;

        // Pass through the backslash that was held
        onKeypressRef.current({
          name: '',
          sequence: '\\',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
        });

        // Then continue processing the current key normally
      }

      // If readline has already identified an arrow key, pass it through
      // immediately, bypassing the Kitty protocol sequence buffering.
      if (['up', 'down', 'left', 'right'].includes(key.name)) {
        onKeypressRef.current(key);
        return;
      }

      // Always pass through Ctrl+C immediately, regardless of protocol state
      // Check both standard format and Kitty protocol sequence
      if (
        (key.ctrl && key.name === 'c') ||
        key.sequence === `${ESC}${KITTY_CTRL_C}`
      ) {
        kittySequenceBuffer = '';
        // If it's the Kitty sequence, create a proper key object
        if (key.sequence === `${ESC}${KITTY_CTRL_C}`) {
          onKeypressRef.current({
            name: 'c',
            ctrl: true,
            meta: false,
            shift: false,
            paste: false,
            sequence: key.sequence,
            kittyProtocol: true,
          });
        } else {
          onKeypressRef.current(key);
        }
        return;
      }

      // If Kitty protocol is enabled, handle CSI sequences
      if (kittyProtocolEnabled) {
        // If we have a buffer or this starts a CSI sequence
        if (
          kittySequenceBuffer ||
          (key.sequence.startsWith(`${ESC}[`) &&
            !key.sequence.startsWith(PASTE_MODE_PREFIX) &&
            !key.sequence.startsWith(PASTE_MODE_SUFFIX) &&
            !key.sequence.startsWith(FOCUS_IN) &&
            !key.sequence.startsWith(FOCUS_OUT))
        ) {
          kittySequenceBuffer += key.sequence;

          // Try to parse the buffer as a Kitty sequence
          const kittyKey = parseKittySequence(kittySequenceBuffer);
          if (kittyKey) {
            kittySequenceBuffer = '';
            onKeypressRef.current(kittyKey);
            return;
          }

          if (config?.getDebugMode()) {
            const codes = Array.from(kittySequenceBuffer).map((ch) =>
              ch.charCodeAt(0),
            );
            // Unless the user is sshing over a slow connection, this likely
            // indicates this is not a kitty sequence but we have incorrectly
            // interpreted it as such. See the examples above for sequences
            // such as FOCUS_IN that are not Kitty sequences.
            console.warn('Kitty sequence buffer has char codes:', codes);
          }

          // If buffer doesn't match expected pattern and is getting long, flush it
          if (kittySequenceBuffer.length > MAX_KITTY_SEQUENCE_LENGTH) {
            // Log telemetry for buffer overflow
            if (config) {
              const event = new KittySequenceOverflowEvent(
                kittySequenceBuffer.length,
                kittySequenceBuffer,
              );
              logKittySequenceOverflow(config, event);
            }
            // Not a Kitty sequence, treat as regular key
            kittySequenceBuffer = '';
          } else {
            // Wait for more characters
            return;
          }
        }
      }
      if (key.name === 'paste-start') {
        isPaste = true;
      } else if (key.name === 'paste-end') {
        isPaste = false;
        onKeypressRef.current({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: true,
          sequence: pasteBuffer.toString(),
        });
        pasteBuffer = Buffer.alloc(0);
      } else {
        if (isPaste) {
          pasteBuffer = Buffer.concat([pasteBuffer, Buffer.from(key.sequence)]);
        } else {
          // Handle special keys
          if (key.name === 'return' && key.sequence === `${ESC}\r`) {
            key.meta = true;
          }
          onKeypressRef.current({ ...key, paste: isPaste });
        }
      }
    };

    const handleRawKeypress = (data: Buffer) => {
      const pasteModePrefixBuffer = Buffer.from(PASTE_MODE_PREFIX);
      const pasteModeSuffixBuffer = Buffer.from(PASTE_MODE_SUFFIX);

      let pos = 0;
      while (pos < data.length) {
        const prefixPos = data.indexOf(pasteModePrefixBuffer, pos);
        const suffixPos = data.indexOf(pasteModeSuffixBuffer, pos);

        // Determine which marker comes first, if any.
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
      setRawMode(false);

      // Clean up any pending backslash timeout
      if (backslashTimeout) {
        clearTimeout(backslashTimeout);
        backslashTimeout = null;
      }

      // If we are in the middle of a paste, send what we have.
      if (isPaste) {
        onKeypressRef.current({
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
  }, [isActive, stdin, setRawMode, kittyProtocolEnabled, config]);
}
