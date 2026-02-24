/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const OMITTED_PREFIXES = new Set([
  'rest of',
  'rest of method',
  'rest of methods',
  'rest of code',
  'unchanged code',
  'unchanged method',
  'unchanged methods',
]);

function isAllDots(str: string): boolean {
  if (str.length === 0) {
    return false;
  }
  for (let i = 0; i < str.length; i++) {
    if (str[i] !== '.') {
      return false;
    }
  }
  return true;
}

function normalizeWhitespace(input: string): string {
  const segments: string[] = [];
  let current = '';

  for (const char of input) {
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      if (current.length > 0) {
        segments.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments.join(' ');
}

function normalizePlaceholder(line: string): string | null {
  let text = line.trim();
  if (!text) {
    return null;
  }

  if (text.startsWith('//')) {
    text = text.slice(2).trim();
  }

  if (text.startsWith('(') && text.endsWith(')')) {
    text = text.slice(1, -1).trim();
  }

  const ellipsisStart = text.indexOf('...');
  if (ellipsisStart < 0) {
    return null;
  }

  const prefixRaw = text.slice(0, ellipsisStart).trim().toLowerCase();
  const suffixRaw = text.slice(ellipsisStart + 3).trim();
  const prefix = normalizeWhitespace(prefixRaw);

  if (!OMITTED_PREFIXES.has(prefix)) {
    return null;
  }

  if (suffixRaw.length > 0 && !isAllDots(suffixRaw)) {
    return null;
  }

  return `${prefix} ...`;
}

/**
 * Detects shorthand omission placeholders such as:
 * - (rest of methods ...)
 * - (rest of code ...)
 * - (unchanged code ...)
 * - // rest of methods ...
 *
 * Returns all placeholders found as normalized tokens.
 */
export function detectOmissionPlaceholders(text: string): string[] {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const matches: string[] = [];

  for (const rawLine of lines) {
    const normalized = normalizePlaceholder(rawLine);
    if (normalized) {
      matches.push(normalized);
    }
  }

  return matches;
}
