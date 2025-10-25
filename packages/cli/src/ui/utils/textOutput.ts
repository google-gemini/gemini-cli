/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Internal state for the singleton
let lastChar = '\n';

/**
 * A singleton utility to manage writing text to stdout, ensuring that newlines
 * are handled consistently and robustly across the application.
 */
export const textOutput = {
  /**
   * Writes a string to stdout.
   * @param str The string to write.
   */
  write(str: string): void {
    if (str.length === 0) {
      return;
    }
    process.stdout.write(str);
    lastChar = str.charAt(str.length - 1);
  },

  /**
   * Writes a string to stdout, ensuring it starts on a new line.
   * If the previous output did not end with a newline, one will be added.
   * This prevents adding extra blank lines if a newline already exists.
   * If no string is provided, it just ensures the output ends with a newline.
   * @param str The optional string to write.
   */
  writeOnNewLine(str?: string): void {
    if (lastChar !== '\n') {
      this.write('\n');
    }
    if (str !== undefined) {
      this.write(str);
    }
  },

  /**
   * FOR TESTING ONLY. Resets the internal state of the controller.
   */
  _resetForTesting(): void {
    lastChar = '\n';
  },
};
