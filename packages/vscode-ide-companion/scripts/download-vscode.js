/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { downloadAndUnzipVSCode } from '@vscode/test-electron';

const TRANSIENT_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
]);

/**
 * Returns true for connection-level failures that are worth retrying.
 * test-electron retries the archive download itself, but not the version
 * lookup against update.code.visualstudio.com, so a single dropped
 * connection there fails the whole run.
 */
export function isTransientNetworkError(err) {
  if (!err || typeof err !== 'object') {
    return false;
  }
  if (err.name === 'TimeoutError' || TRANSIENT_ERROR_CODES.has(err.code)) {
    return true;
  }
  return (
    Array.isArray(err.errors) &&
    err.errors.length > 0 &&
    err.errors.every(isTransientNetworkError)
  );
}

/**
 * Downloads VS Code for the integration tests, retrying transient network
 * failures with a linear backoff. Only the download is retried; the test run
 * itself is never repeated.
 */
export async function downloadVSCodeWithRetry(
  options,
  {
    download = downloadAndUnzipVSCode,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log = console.warn,
    attempts = 4,
    backoffMs = 10_000,
  } = {},
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await download(options);
    } catch (err) {
      if (attempt >= attempts || !isTransientNetworkError(err)) {
        throw err;
      }
      const delay = backoffMs * attempt;
      log(
        `Downloading VS Code failed (attempt ${attempt}/${attempts}): ${
          err.code ?? err.message
        }. Retrying in ${delay / 1000}s...`,
      );
      await sleep(delay);
    }
  }
}
