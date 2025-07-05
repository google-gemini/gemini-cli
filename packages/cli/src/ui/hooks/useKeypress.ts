/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { useStdin } from 'ink';
import readline from 'readline';

export interface Key {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  paste: boolean;
  sequence: string;
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
 */
export function useKeypress(
  onKeypress: (key: Key) => void,
  { isActive }: { isActive: boolean },
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

    const rl = readline.createInterface({ input: stdin });
    let isPaste = false;
    let pasteBuffer = Buffer.alloc(0);
    let isComposing = false;
    let composingBuffer = '';

    const handleKeypress = (_: unknown, key: Key) => {
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

          // IME composition handling
          if (key.sequence && key.sequence.length > 1 && !key.ctrl && !key.meta && !key.name) {
            // This might be a multi-byte character (e.g., from IME)
            const sequence = key.sequence;
            
            // Check if this is likely IME input (contains multi-byte characters)
            const isMultiByte = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(sequence);
            
            if (isMultiByte) {
              // For IME input, we need to handle composition properly
              if (isComposing) {
                // If we're already composing, this might be an update
                composingBuffer = sequence;
              } else {
                // Start of composition
                isComposing = true;
                composingBuffer = sequence;
              }
              
              // Send the complete composed text
              onKeypressRef.current({
                ...key,
                paste: isPaste,
                sequence: composingBuffer,
              });
              
              // Reset composition state
              isComposing = false;
              composingBuffer = '';
            } else {
              onKeypressRef.current({ ...key, paste: isPaste });
            }
          } else {
            onKeypressRef.current({ ...key, paste: isPaste });
          }
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
  }, [isActive, stdin, setRawMode]);
}
