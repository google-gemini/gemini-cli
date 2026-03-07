/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

function normalizeInput(input: string): string {
  return input.trim().toLowerCase();
}

export function parseVoiceIntent(input: string): string | null {
  const normalized = normalizeInput(input);

  if (
    normalized.includes('npm install') ||
    (normalized.includes('install') &&
      /(dependencies|dependency|deps)\b/.test(normalized))
  ) {
    return 'npm install';
  }

  if (
    normalized.includes('npm run build') ||
    (normalized.includes('build') && normalized.includes('project'))
  ) {
    return 'npm run build';
  }

  if (
    normalized.includes('npm run preflight') ||
    (normalized.includes('run') && normalized.includes('preflight'))
  ) {
    return 'npm run preflight';
  }

  return null;
}

export function suggestVoiceIntent(input: string): string | null {
  const normalized = normalizeInput(input);

  if (normalized.includes('install')) {
    return 'npm install';
  }

  if (normalized.includes('build')) {
    return 'npm run build';
  }

  if (normalized.includes('check') || normalized.includes('preflight')) {
    return 'npm run preflight';
  }

  return null;
}
