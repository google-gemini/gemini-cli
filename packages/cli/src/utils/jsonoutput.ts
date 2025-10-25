/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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

  const ANSI_PATTERN = String.raw`\u001B\[[0-9;]*m`;
  const ansiRegexp = new RegExp(ANSI_PATTERN, 'g');
  if (ansiRegexp.test(trimmed)) return false;

  return true;
}

export function tryParseJSON(input: string): object | null {
  if (!checkInput(input)) return null;
  const trimmed = input.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== 'object') {
      return null;
    }
    if (Array.isArray(parsed) && parsed.length === 0) {
      return null;
    }

    if (!Array.isArray(parsed) && Object.keys(parsed).length === 0) return null;

    return parsed;
  } catch (_err) {
    return null;
  }
}

export function parseOrRaw(input: string): string {
  const parsed = tryParseJSON(input);
  if (parsed !== null) {
    return JSON.stringify(parsed, null, 2);
  }
  return input;
}
