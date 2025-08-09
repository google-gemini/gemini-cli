/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { useStdin } from 'ink';
import readline from 'readline';
import { PassThrough } from 'stream';

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
  const fastInputBufferRef = useRef<string>('');
  const fastInputTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    let pasteTimeout: NodeJS.Timeout | null = null;

    const handleKeypress = (_: unknown, key: Key) => {
      if (key.name === 'paste-start') {
        isPaste = true;
        // Clear any existing paste timeout
        if (pasteTimeout) {
          clearTimeout(pasteTimeout);
        }
        // Set a safety timeout for incomplete paste operations
        pasteTimeout = setTimeout(() => {
          if (isPaste && pasteBuffer.length > 0) {
            // Paste operation timed out, send whatever we have
            onKeypressRef.current({
              name: '',
              ctrl: false,
              meta: false,
              shift: false,
              paste: true,
              sequence: pasteBuffer.toString(),
            });
            pasteBuffer = Buffer.alloc(0);
            isPaste = false;
          }
        }, 1000); // 1 second timeout
      } else if (key.name === 'paste-end') {
        isPaste = false;
        if (pasteTimeout) {
          clearTimeout(pasteTimeout);
          pasteTimeout = null;
        }
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
          // Detect potential paste operations that don't use bracketed paste
          // by looking for rapid multi-character input
          if (
            key.sequence &&
            key.sequence.length > 1 &&
            !key.ctrl &&
            !key.meta
          ) {
            // Clear existing fast input timeout
            if (fastInputTimeoutRef.current) {
              clearTimeout(fastInputTimeoutRef.current);
            }

            fastInputBufferRef.current += key.sequence;

            // If we have accumulated significant content quickly, treat as paste
            fastInputTimeoutRef.current = setTimeout(() => {
              if (fastInputBufferRef.current.length > 0) {
                const content = fastInputBufferRef.current;
                fastInputBufferRef.current = '';

                // If content contains newlines and is substantial, treat as paste
                if (content.includes('\n') && content.length > 10) {
                  onKeypressRef.current({
                    name: '',
                    ctrl: false,
                    meta: false,
                    shift: false,
                    paste: true,
                    sequence: content,
                  });
                  return;
                }
              }
              fastInputBufferRef.current = '';
            }, 50); // 50ms detection window

            // For now, still send the original key event
          } else {
            // Reset fast input buffer for single character inputs
            fastInputBufferRef.current = '';
            if (fastInputTimeoutRef.current) {
              clearTimeout(fastInputTimeoutRef.current);
              fastInputTimeoutRef.current = null;
            }
          }

          // Handle special keys
          if (key.name === 'return' && key.sequence === '\x1B\r') {
            key.meta = true;
          }
          onKeypressRef.current({ ...key, paste: isPaste });
        }
      }
    };

    const handleRawKeypress = (data: Buffer) => {
      const PASTE_MODE_PREFIX = Buffer.from('\x1B[200~');
      const PASTE_MODE_SUFFIX = Buffer.from('\x1B[201~');

      let pos = 0;
      while (pos < data.length) {
        const prefixPos = data.indexOf(PASTE_MODE_PREFIX, pos);
        const suffixPos = data.indexOf(PASTE_MODE_SUFFIX, pos);

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
        markerLength = PASTE_MODE_SUFFIX.length;

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

      // Clean up timeouts
      if (pasteTimeout) {
        clearTimeout(pasteTimeout);
      }
      if (fastInputTimeoutRef.current) {
        clearTimeout(fastInputTimeoutRef.current);
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
  }, [isActive, stdin, setRawMode]);
}
