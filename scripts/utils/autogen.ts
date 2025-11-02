/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import prettier from 'prettier';

export async function formatWithPrettier(content: string, filePath: string) {
  const options = await prettier.resolveConfig(filePath);
  return prettier.format(content, {
    ...options,
    filepath: filePath,
  });
}

export function normalizeForCompare(content: string): string {
  return content.replace(/\r\n/g, '\n').trimEnd();
}

export function escapeBackticks(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}
