/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export function sanitizePromptString(value: string): string {
  return value
    .replace(/```/g, "'''")
    .replace(/[<>]/g, (char) => (char === '<' ? '&lt;' : '&gt;'))
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ''); // eslint-disable-line no-control-regex
}

export function sanitizePromptValue(value: unknown): string {
  return sanitizePromptString(JSON.stringify(value) ?? '');
}
