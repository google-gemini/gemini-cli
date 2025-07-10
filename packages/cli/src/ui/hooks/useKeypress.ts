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
 * A hook that listens for keypress events from stdin, providing a key object
 * that mirrors the one from Node's `readline` module, with a 'paste' flag
 * indicating whether the input is a paste. Paste detection uses bracketed paste
 * mode (\x1b[200~ and \x1b[201~) when supported, with a timeout-based heuristic
 * (grouping rapid keypresses within 50ms) as a fallback. Bracketed paste mode
 * is automatically enabled if the terminal supports it, determined by TTY status,
 * TERM environment variable, and successful enabling.
 *
 * Pasted content is sent as a single key event with the full paste in the
 * sequence field and paste set to true. Special keys (e.g., arrow keys) are
 * handled correctly via readline, ensuring terminal functionality is preserved.
 * Robustly handles edge cases like split paste chunks, unterminated sequences
 * (via a 1-second timeout applied only when a paste begins), and partial markers
 * (e.g., \x1b[200, excluding fragments like '~' from paste content). Embedded
 * paste-end markers (\x1b[201~) in pasted content terminate the paste, per
 * terminal protocol behavior, and subsequent content is treated as a new paste
 * if followed by another end marker. Ensures terminal responsiveness by resetting
 * paste state after a 50ms timeout to suppress duplicate keypress events for
 * pasted content.
 *
 * @param onKeypress - The callback function to execute on each keypress or paste.
 * @param options - Options to control the hook's behavior.
 * @param options.isActive - Whether the hook should be actively listening for input.
 */
export function useKeypress(
  onKeypress: (key: Key) => void,
  { isActive }: { isActive: boolean },
) {
  const { stdin, setRawMode } = useStdin();
  const onKeypressRef = useRef(onKeypress);
  const keyBufferRef = useRef<Key[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pasteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPasteModeRef = useRef(false);
  const pasteBufferRef = useRef<string>('');
  const pasteHandledRef = useRef(false);
  const isBracketedPasteSupportedRef = useRef(false);
  const partialStartMarkerRef = useRef<string>(''); // Track incomplete \x1b[200~

  useEffect(() => {
    onKeypressRef.current = onKeypress;
  }, [onKeypress]);

  useEffect(() => {
    if (!isActive || !stdin.isTTY) {
      return;
    }

    setRawMode(true);
    const rl = readline.createInterface({ input: stdin });
    readline.emitKeypressEvents(stdin, rl);

    // Detect bracketed paste support
    const term = process.env.TERM?.toLowerCase() || '';
    const knownSupportedTerms = [
      'xterm',
      'screen',
      'tmux',
      'rxvt',
      'linux',
      'cygwin',
      'st',
      'alacritty',
      'kitty',
    ];
    const isLikelySupported =
      stdin.writable &&
      knownSupportedTerms.some((supportedTerm) => term.includes(supportedTerm));

    if (isLikelySupported) {
      try {
        stdin.write('\x1b[?2004h');
        isBracketedPasteSupportedRef.current = true;
      } catch (err) {
        isBracketedPasteSupportedRef.current = false;
      }
    }

    const maxInputDelay = 50; // Milliseconds, for reliable paste detection
    const pasteTimeoutDuration = 1000; // 1 second for unterminated pastes
    const startMarker = '\x1b[200~';
    const endMarker = '\x1b[201~';

    const handleInput = () => {
      const keys = keyBufferRef.current;
      if (keys.length === 0) return;

      // Combine all keypresses in the buffer as a paste
      const combinedSequence = keys.map((key) => key.sequence).join('');
      onKeypressRef.current({
        name: '',
        ctrl: false,
        meta: false,
        shift: false,
        paste: true,
        sequence: combinedSequence,
      });

      keyBufferRef.current = [];
      timeoutRef.current = null;
      pasteHandledRef.current = false; // Reset after paste processing
    };

    const resetPasteState = () => {
      if (isPasteModeRef.current && pasteBufferRef.current.length > 0) {
        onKeypressRef.current({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: true,
          sequence: pasteBufferRef.current,
        });
      }
      isPasteModeRef.current = false;
      pasteBufferRef.current = '';
      pasteHandledRef.current = false;
      partialStartMarkerRef.current = '';
      if (pasteTimeoutRef.current) {
        clearTimeout(pasteTimeoutRef.current);
        pasteTimeoutRef.current = null;
      }
    };

    const handleRawData = (data: Buffer) => {
      if (!isBracketedPasteSupportedRef.current) {
        return;
      }

      let input = data.toString('utf-8');

      if (partialStartMarkerRef.current.length > 0) {
        input = partialStartMarkerRef.current + input;
        partialStartMarkerRef.current = '';
      }

      while (input.length > 0) {
        if (isPasteModeRef.current) {
          const endMarkerIndex = input.indexOf(endMarker);
          if (endMarkerIndex !== -1) {
            pasteBufferRef.current += input.slice(0, endMarkerIndex);

            if (pasteBufferRef.current.length > 0) {
              pasteHandledRef.current = true;
              onKeypressRef.current({
                name: '',
                ctrl: false,
                meta: false,
                shift: false,
                paste: true,
                sequence: pasteBufferRef.current,
              });
              keyBufferRef.current = [];
              if (timeoutRef.current) clearTimeout(timeoutRef.current);
              timeoutRef.current = setTimeout(() => {
                pasteHandledRef.current = false;
                timeoutRef.current = null;
              }, maxInputDelay);
            }

            isPasteModeRef.current = false;
            pasteBufferRef.current = '';
            if (pasteTimeoutRef.current) {
              clearTimeout(pasteTimeoutRef.current);
              pasteTimeoutRef.current = null;
            }
            input = input.slice(endMarkerIndex + endMarker.length);
          } else {
            pasteBufferRef.current += input;
            input = '';
          }
        } else {
          const startMarkerIndex = input.indexOf(startMarker);
          const endMarkerIndex = input.indexOf(endMarker);

          if (
            startMarkerIndex !== -1 &&
            (endMarkerIndex === -1 || startMarkerIndex < endMarkerIndex)
          ) {
            // Skip regular input before start marker; let readline handle it
            isPasteModeRef.current = true;
            pasteBufferRef.current = '';
            input = input.slice(startMarkerIndex + startMarker.length);
            pasteTimeoutRef.current = setTimeout(
              resetPasteState,
              pasteTimeoutDuration,
            );
          } else if (endMarkerIndex !== -1) {
            // Handle stray end marker as a paste (e.g., content before it)
            const pastedContent = input.slice(0, endMarkerIndex);
            if (pastedContent.length > 0) {
              onKeypressRef.current({
                name: '',
                ctrl: false,
                meta: false,
                shift: false,
                paste: true,
                sequence: pastedContent,
              });
            }
            input = input.slice(endMarkerIndex + endMarker.length);
          } else {
            if (startMarker.startsWith(input)) {
              partialStartMarkerRef.current = input;
              input = '';
            } else {
              // Skip non-paste input; let readline handle it
              input = '';
            }
          }
        }
      }
    };

    const handleKeypress = (str: string, key: Key) => {
      if (isPasteModeRef.current || pasteHandledRef.current) {
        return;
      }

      keyBufferRef.current.push(key);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        const keys = keyBufferRef.current;
        if (keys.length === 1) {
          const singleKey = keys[0];
          if (singleKey.name === 'return' && singleKey.sequence === '\x1b\r') {
            singleKey.meta = true;
          }
          onKeypressRef.current({ ...singleKey, paste: false });
          keyBufferRef.current = [];
          timeoutRef.current = null;
        } else {
          handleInput();
        }
      }, maxInputDelay);
    };

    stdin.prependListener('data', handleRawData);
    stdin.prependListener('keypress', handleKeypress);

    return () => {
      stdin.removeListener('data', handleRawData);
      stdin.removeListener('keypress', handleKeypress);
      rl.close();
      setRawMode(false);

      if (isBracketedPasteSupportedRef.current && stdin.writable) {
        try {
          stdin.write('\x1b[?2004l');
        } catch (err) {
          // Silently handle error
        }
      }

      if (isPasteModeRef.current && pasteBufferRef.current.length > 0) {
        onKeypressRef.current({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: true,
          sequence: pasteBufferRef.current,
        });
      } else if (keyBufferRef.current.length > 0) {
        handleInput();
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (pasteTimeoutRef.current) {
        clearTimeout(pasteTimeoutRef.current);
      }

      isPasteModeRef.current = false;
      pasteBufferRef.current = '';
      keyBufferRef.current = [];
      pasteHandledRef.current = false;
      isBracketedPasteSupportedRef.current = false;
      partialStartMarkerRef.current = '';
    };
  }, [isActive, stdin, setRawMode]);
}