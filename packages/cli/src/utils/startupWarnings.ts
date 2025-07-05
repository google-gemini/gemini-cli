/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import os from 'os';
import { join as pathJoin } from 'node:path';
import { getErrorMessage } from '@google/gemini-cli-core';
import { getNodeVersionWarning } from './nodeVersionWarning.js';
const warningsFilePath = pathJoin(os.tmpdir(), 'gemini-cli-warnings.txt');

export async function getStartupWarnings(): Promise<string[]> {
  const warnings: string[] = [];
  try {
    await fs.access(warningsFilePath);
    const warningsContent = await fs.readFile(warningsFilePath, 'utf-8');
    warnings.push(
      ...warningsContent.split('\n').filter((line) => line.trim() !== ''),
    );
    try {
      await fs.unlink(warningsFilePath);
    } catch {
      warnings.push('Warning: Could not delete temporary warnings file.');
    }
  } catch (err: unknown) {
    // If fs.access throws, it means the file doesn't exist or is not accessible.
    // This is not an error in the context of fetching warnings, so return empty.
    // Only return an error message if it's not a "file not found" type error.
    // However, the original logic returned an error message for any fs.existsSync failure.
    // To maintain closer parity while making it async, we'll check the error code.
    // ENOENT is "Error NO ENTry" (file not found).
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      // File not found, no warnings to return.
    }
    // For other errors (permissions, etc.), return the error message.
    console.error(
      `Error checking/reading warnings file: ${getErrorMessage(err)}`,
    );
  }
  // Always add Node.js version warning if needed
  const nodeWarning = getNodeVersionWarning(20);
  if (nodeWarning) {
    warnings.unshift(nodeWarning); // Show Node warning first
  }
  return warnings;
}
