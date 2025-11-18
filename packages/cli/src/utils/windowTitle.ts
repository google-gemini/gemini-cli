/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Computes the window title for the Gemini CLI application.
 *
 * @param folderName - The name of the current folder/workspace to display in the title
 * @returns The computed window title, either from CLI_TITLE environment variable or the default Gemini title
 */
export function computeWindowTitle(folderName: string): string {
  const title = process.env['CLI_TITLE'] || `Gemini - ${folderName}`;

  // Remove control characters that could cause issues in terminal titles
  return title.replace(
    // eslint-disable-next-line no-control-regex
    /[\x00-\x1F\x7F]/g,
    '',
  );
}
