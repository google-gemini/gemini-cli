/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export function sanitizePromptString(value: string): string {
  return value
    .replace(/\\[rn]/g, ' ')
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/```/g, "'''")
    .replace(/[<>]/g, (char) => (char === '<' ? '&lt;' : '&gt;'))
    .replace(/[\x00-\x1f\x7f]/g, ''); // eslint-disable-line no-control-regex
}

export function sanitizePromptValue(value: unknown): string {
  return sanitizePromptString(JSON.stringify(value) ?? '');
}
