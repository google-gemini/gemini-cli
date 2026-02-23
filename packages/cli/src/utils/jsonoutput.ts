/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stripAnsi from 'strip-ansi';

export function checkInput(input: string | null | undefined): boolean {
  if (input === null || input === undefined) {
    return false;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return false;
  }

  if (!/^(?:\[|\{)/.test(trimmed)) {
    return false;
  }

  if (stripAnsi(trimmed) !== trimmed) return false;

  return true;
}

export function tryParseJSON(input: string): object | null {
  if (!checkInput(input)) return null;
  const trimmed = input.trim();
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== 'object') {
      return null;
    }
    if (Array.isArray(parsed) && parsed.length === 0) {
      return null;
    }

    if (!Array.isArray(parsed) && Object.keys(parsed).length === 0) return null;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return parsed;
  } catch (_err) {
    return null;
  }
}
