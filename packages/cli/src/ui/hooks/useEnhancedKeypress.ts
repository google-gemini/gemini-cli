/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { useStdin } from 'ink';
import readline from 'readline';
import { Key } from './useKeypress.js';

interface EnhancedKey extends Key {
  kittyProtocol?: boolean;
}

/**
 * Enhanced keypress hook that supports both standard readline keypresses
 * and Kitty keyboard protocol sequences.
 *
 * When Kitty protocol is enabled, it parses CSI sequences for enhanced keys:
 * - CSI <number> ; <modifiers> u (or ~)
 *
 * Key codes for Enter variants:
 * - 13: Enter/Return key
 *
 * Modifier flags:
 * - 2: Shift
 * - 5: Ctrl
 * - 9: Alt
 */
export function useEnhancedKeypress(
  onKeypress: (key: EnhancedKey) => void,
  {
    isActive,
    kittyProtocolEnabled,
  }: { isActive: boolean; kittyProtocolEnabled: boolean },
) {
  const { stdin, setRawMode } = useStdin();
  const onKeypressRef = useRef(onKeypress);
  const kittySequenceBuffer = useRef('');

  useEffect(() => {
    onKeypressRef.current = onKeypress;
  }, [onKeypress]);

  useEffect(() => {
    if (!isActive || !stdin.isTTY) {
      return;
    }

    setRawMode(true);

    const rl = readline.createInterface({ input: stdin });
    let isPaste = false;
    let pasteBuffer = Buffer.alloc(0);

    // Parse Kitty protocol sequences
    const parseKittySequence = (sequence: string): EnhancedKey | null => {
      // Match CSI <number> ; <modifiers> u or ~
      // eslint-disable-next-line no-control-regex
      const match = sequence.match(/^\x1b\[(\d+)(;(\d+))?([u~])$/);
      if (!match) return null;

      const keyCode = parseInt(match[1], 10);
      const modifiers = match[3] ? parseInt(match[3], 10) : 1;

      // Decode modifiers (subtract 1 as per Kitty protocol spec)
      const modifierBits = modifiers - 1;
      const shift = (modifierBits & 1) === 1;
      const alt = (modifierBits & 2) === 2;
      const ctrl = (modifierBits & 4) === 4;

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

      // Handle Ctrl+C (code 99 for 'c')
      if (keyCode === 99 && ctrl) {
        return {
          name: 'c',
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
      // Always pass through Ctrl+C immediately, regardless of protocol state
      // Check both standard format and Kitty protocol sequence
      if ((key.ctrl && key.name === 'c') || key.sequence === '\x1b[99;5u') {
        kittySequenceBuffer.current = '';
        // If it's the Kitty sequence, create a proper key object
        if (key.sequence === '\x1b[99;5u') {
          onKeypressRef.current({
            name: 'c',
            ctrl: true,
            meta: false,
            shift: false,
            paste: false,
            sequence: key.sequence,
          });
        } else {
          onKeypressRef.current(key);
        }
        return;
      }

      // If Kitty protocol is enabled, check for CSI sequences
      if (kittyProtocolEnabled && key.sequence.startsWith('\x1b[')) {
        kittySequenceBuffer.current += key.sequence;

        // Try to parse the buffer as a Kitty sequence
        const kittyKey = parseKittySequence(kittySequenceBuffer.current);
        if (kittyKey) {
          kittySequenceBuffer.current = '';
          onKeypressRef.current(kittyKey);
          return;
        }

        // If buffer doesn't match expected pattern and is getting long, flush it
        if (kittySequenceBuffer.current.length > 10) {
          // Not a Kitty sequence, treat as regular key
          kittySequenceBuffer.current = '';
        } else {
          // Wait for more characters
          return;
        }
      }

      // Reset buffer if we get non-CSI input
      if (kittySequenceBuffer.current && !key.sequence.startsWith('\x1b[')) {
        kittySequenceBuffer.current = '';
      }

      // Standard keypress handling
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
          if (key.name === 'return' && key.sequence === '\x1B\r') {
            key.meta = true;
          }
          onKeypressRef.current({ ...key, paste: isPaste });
        }
      }
    };

    readline.emitKeypressEvents(stdin, rl);
    stdin.on('keypress', handleKeypress);

    return () => {
      stdin.removeListener('keypress', handleKeypress);
      rl.close();
      setRawMode(false);

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
  }, [isActive, stdin, setRawMode, kittyProtocolEnabled]);
}
