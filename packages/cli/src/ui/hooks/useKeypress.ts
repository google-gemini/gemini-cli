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

    // Enhanced paste detection for direct mode (Node 20+)
    let rapidInputBuffer: Key[] = [];
    let rapidInputTimer: NodeJS.Timeout | null = null;
    let lastKeypressTime = 0;
    const RAPID_INPUT_THRESHOLD = 30; // ms - detect rapid typing
    const MULTILINE_FLUSH_DELAY = 100; // ms - wait before flushing multiline

    // Legacy mode paste detection
    let legacyPasteBuffer = Buffer.alloc(0);
    let isLegacyPaste = false;
    const PASTE_START = '\x1B[200~';
    const PASTE_END = '\x1B[201~';

    const handleKeypress = (_: unknown, key: Key) => {
      if (key.name === 'paste-start') {
        isPaste = true;
        rapidInputBuffer = [];
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

          // Skip rapid input detection for legacy mode during paste
          if (usePassthrough && isLegacyPaste) {
            // Don't buffer during legacy paste - these are individual chars
            return;
          }

          // In legacy mode (passthrough), don't use rapid input detection
          // Individual keystrokes should be immediate
          if (usePassthrough) {
            onKeypressRef.current({ ...key, paste: false });
            return;
          }

          // Rapid input detection only for modern mode (Node 20+)
          const now = Date.now();
          const timeDiff = now - lastKeypressTime;
          lastKeypressTime = now;

          // Check if this looks like rapid input (likely paste)
          if (timeDiff < RAPID_INPUT_THRESHOLD && rapidInputBuffer.length > 0) {
            rapidInputBuffer.push(key);

            // Clear existing timer
            if (rapidInputTimer) {
              clearTimeout(rapidInputTimer);
            }

            // Set timer to flush the buffer
            rapidInputTimer = setTimeout(() => {
              const combinedContent = rapidInputBuffer
                .map((k) => k.sequence)
                .join('');
              const hasNewlines =
                combinedContent.includes('\r') ||
                combinedContent.includes('\n');
              const charCount = combinedContent.length;

              if (hasNewlines && charCount > 5) {
                // Looks like multiline paste
                onKeypressRef.current({
                  name: '',
                  ctrl: false,
                  meta: false,
                  shift: false,
                  paste: true,
                  sequence: combinedContent,
                });
              } else {
                // Process as individual keystrokes
                rapidInputBuffer.forEach((bufferedKey) => {
                  onKeypressRef.current({ ...bufferedKey, paste: false });
                });
              }

              rapidInputBuffer = [];
              rapidInputTimer = null;
            }, MULTILINE_FLUSH_DELAY);

            return; // Don't process this key individually
          } else {
            // Not rapid input or first key - handle buffering logic
            if (rapidInputBuffer.length > 0) {
              // We have buffered content but this key is not rapid - flush buffer as individual keys
              if (rapidInputTimer) {
                clearTimeout(rapidInputTimer);
                rapidInputTimer = null;
              }

              // Send buffered keys individually
              rapidInputBuffer.forEach((bufferedKey) => {
                onKeypressRef.current({ ...bufferedKey, paste: false });
              });
              rapidInputBuffer = [];

              // Now process current key normally
              onKeypressRef.current({ ...key, paste: false });
              return;
            } else {
              // No existing buffer - this might be start of rapid sequence, buffer briefly
              rapidInputBuffer = [key];

              // Set a short timer to see if more rapid input follows
              rapidInputTimer = setTimeout(() => {
                if (rapidInputBuffer.length === 1) {
                  // Only one key in buffer, send as normal keystroke
                  const bufferedKey = rapidInputBuffer[0];
                  onKeypressRef.current({ ...bufferedKey, paste: false });
                }
                rapidInputBuffer = [];
                rapidInputTimer = null;
              }, RAPID_INPUT_THRESHOLD);

              return; // Don't process immediately, wait for timer
            }
          }
        }
      }
    };

    const handleLegacyData = (data: Buffer) => {
      legacyPasteBuffer = Buffer.concat([legacyPasteBuffer, data]);
      let bufferStr = legacyPasteBuffer.toString();

      // Check for paste start
      const pasteStartIndex = bufferStr.indexOf(PASTE_START);
      if (pasteStartIndex !== -1) {
        const dataBeforePaste = bufferStr.slice(0, pasteStartIndex);
        if (dataBeforePaste.length > 0) {
          keypressStream.write(Buffer.from(dataBeforePaste));
        }
        isLegacyPaste = true;
        // Remove everything up to and including the paste start sequence
        const afterPasteStart = bufferStr.slice(
          pasteStartIndex + PASTE_START.length,
        );
        legacyPasteBuffer = Buffer.from(afterPasteStart);
        // Update bufferStr to reflect the new buffer content
        bufferStr = legacyPasteBuffer.toString();
      }

      // Check for paste end
      const pasteEndIndex = bufferStr.indexOf(PASTE_END);
      if (pasteEndIndex !== -1 && isLegacyPaste) {
        // Extract the paste content
        const pasteContent = bufferStr.slice(0, pasteEndIndex);
        // Send paste event
        const pasteEvent = {
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: true,
          sequence: pasteContent,
        };
        onKeypressRef.current(pasteEvent);

        // Reset state
        isLegacyPaste = false;
        const afterPasteEnd = bufferStr.slice(pasteEndIndex + PASTE_END.length);
        legacyPasteBuffer = Buffer.from(afterPasteEnd);

        // Process any remaining data
        if (afterPasteEnd.length > 0) {
          keypressStream.write(Buffer.from(afterPasteEnd));
        }
        return;
      }

      // If we're not in a paste, or haven't found the end yet,
      // process normally (but don't process during paste)
      if (!isLegacyPaste) {
        keypressStream.write(legacyPasteBuffer);
        legacyPasteBuffer = Buffer.alloc(0); // Clear buffer if not in paste
      }
      // If we are in a paste but haven't found the end, keep buffering
    };

    const flushRapidInput = () => {
      if (rapidInputBuffer.length > 0) {
        rapidInputBuffer.forEach((bufferedKey) => {
          onKeypressRef.current({ ...bufferedKey, paste: false });
        });
        rapidInputBuffer = [];
      }
    };

    const flushLegacyPaste = () => {
      if (isLegacyPaste && legacyPasteBuffer.length > 0) {
        // Send incomplete paste content
        onKeypressRef.current({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: true,
          sequence: legacyPasteBuffer.toString(),
        });
        legacyPasteBuffer = Buffer.alloc(0);
        isLegacyPaste = false;
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
      stdin.on('data', handleLegacyData);
    } else {
      rl = readline.createInterface({ input: stdin, escapeCodeTimeout: 0 });
      readline.emitKeypressEvents(stdin, rl);
      stdin.on('keypress', handleKeypress);
    }

    return () => {
      // Clean up rapid input timer
      if (rapidInputTimer) {
        clearTimeout(rapidInputTimer);
        rapidInputTimer = null;
      }

      // Flush any pending rapid input
      flushRapidInput();

      // Flush any pending legacy paste
      flushLegacyPaste();

      if (usePassthrough) {
        keypressStream.removeListener('keypress', handleKeypress);
        stdin.removeListener('data', handleLegacyData);
      } else {
        stdin.removeListener('keypress', handleKeypress);
      }

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
