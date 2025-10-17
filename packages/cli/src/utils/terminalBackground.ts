/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Detects whether the terminal background is light or dark using OSC 11 query.
 *
 * This function queries the terminal for its background color by sending an OSC 11
 * escape sequence. The terminal responds with RGB values, which are used to calculate
 * luminance via the WCAG formula. A threshold of 0.5 determines light vs dark.
 *
 * Falls back to 'unknown' if:
 * - stdin/stdout is not a TTY
 * - Terminal doesn't support OSC 11
 * - Response times out
 * - An error occurs during detection
 *
 * The function properly cleans up event listeners and restores stdin state to prevent
 * race conditions and memory leaks.
 *
 * @param timeoutMs Timeout in milliseconds to wait for terminal response (default: 100ms)
 * @returns Promise resolving to 'light', 'dark', or 'unknown'
 *
 * @example
 * ```typescript
 * const background = await detectTerminalBackground();
 * if (background === 'light') {
 *   // Use light theme
 * }
 * ```
 */
export async function detectTerminalBackground(
  timeoutMs = 100,
): Promise<'light' | 'dark' | 'unknown'> {
  // Skip detection if stdin is not a TTY or in non-interactive mode
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return 'unknown';
  }

  return new Promise((resolve) => {
    let timeout: NodeJS.Timeout | null = null;
    let dataHandler: ((data: Buffer) => void) | null = null;
    let response = '';
    let resolved = false;

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      if (dataHandler) {
        process.stdin.off('data', dataHandler);
        dataHandler = null;
      }
      // Restore stdin state
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      }
    };

    const safeResolve = (value: 'light' | 'dark' | 'unknown') => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(value);
      }
    };

    // Set timeout for terminal response
    timeout = setTimeout(() => {
      safeResolve('unknown');
    }, timeoutMs);

    // Listen for terminal response
    dataHandler = (data: Buffer) => {
      // Ignore data if already resolved (safety check)
      if (resolved) {
        return;
      }

      response += data.toString();

      // Parse OSC 11 response format: ESC]11;rgb:RRRR/GGGG/BBBBESC\ or ESC]11;rgb:RR/GG/BBBEL
      const match = response.match(
        // eslint-disable-next-line no-control-regex
        /\x1b\]11;rgb:([0-9a-f]+)\/([0-9a-f]+)\/([0-9a-f]+)(?:\x1b\\|\x07)/i,
      );

      if (match) {
        // Scale the hex value to an 8-bit integer (0-255) to handle different digit lengths (1-4).
        const scale = (hex: string) =>
          Math.round((parseInt(hex, 16) / (16 ** hex.length - 1)) * 255);
        const r = scale(match[1]);
        const g = scale(match[2]);
        const b = scale(match[3]);

        // Calculate relative luminance using WCAG formula
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // Threshold of 0.5: above is light, below is dark
        safeResolve(luminance > 0.5 ? 'light' : 'dark');
      }
    };

    try {
      // Set stdin to raw mode to receive terminal responses
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
      }

      process.stdin.on('data', dataHandler);

      // Send OSC 11 query to terminal
      process.stdout.write('\x1b]11;?\x1b\\');
    } catch (_error) {
      safeResolve('unknown');
    }
  });
}
