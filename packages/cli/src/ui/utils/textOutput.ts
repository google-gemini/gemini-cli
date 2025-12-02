/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A utility to manage writing text to stdout, ensuring that newlines
 * are handled consistently and robustly across the application.
 */

import stripAnsi from 'strip-ansi';

export class TextOutput {
  private atStartOfLine = true;
  private outputStream: NodeJS.WriteStream;

  constructor(outputStream: NodeJS.WriteStream = process.stdout) {
    this.outputStream = outputStream;
  }

  /**
   * Writes a string to stdout.
   * @param str The string to write.
   */
  write(str: string): void {
    if (str.length === 0) {
      return;
    }
    this.outputStream.write(str);
    const strippedStr = stripAnsi(str);
    if (strippedStr.length > 0) {
      this.atStartOfLine = strippedStr.endsWith('\n');
    }
  }

  /**
   * Writes a string to stdout, ensuring it starts on a new line.
   * If the previous output did not end with a newline, one will be added.
   * This prevents adding extra blank lines if a newline already exists.
   * @param str The string to write.
   */
  writeOnNewLine(str: string): void {
    if (!this.atStartOfLine) {
      this.write('\n');
    }
    this.write(str);
  }

  /**
   * Ensures that the output ends with a newline. If the last character
   * written was not a newline, one will be added.
   */
  ensureTrailingNewline(): void {
    if (!this.atStartOfLine) {
      this.write('\n');
    }
  }
}
