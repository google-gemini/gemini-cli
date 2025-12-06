/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import { join as pathJoin } from 'node:path';
import { getErrorMessage } from '@google/gemini-cli-core';

const warningsFilePath = pathJoin(os.tmpdir(), 'gemini-cli-warnings.txt');

export async function getStartupWarnings(): Promise<string[]> {
  try {
    await fs.access(warningsFilePath); // Check if file exists
    const warningsContent = await fs.readFile(warningsFilePath, 'utf-8');
    const warnings = warningsContent
      .split('\n')
      .filter((line) => line.trim() !== '');
    try {
      await fs.unlink(warningsFilePath);
    } catch {
      warnings.push('Warning: Could not delete temporary warnings file.');
    }
    return warnings;
  } catch (err: unknown) {
    // If fs.access throws, it means the file doesn't exist or is not accessible.
    // This is not an error in the context of fetching warnings, so return empty.
    // Only return an error message if it's not a "file not found" type error.
    // However, the original logic returned an error message for any fs.existsSync failure.
    // To maintain closer parity while making it async, we'll check the error code.
    // ENOENT is "Error NO ENTry" (file not found).
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return []; // File not found, no warnings to return.
    }
    // For other errors (permissions, etc.), return the error message.
    return [`Error checking/reading warnings file: ${getErrorMessage(err)}`];
  }
}
