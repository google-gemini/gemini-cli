/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordDotEnvKeys,
  getDotEnvKeys,
  clearDotEnvKeys,
} from './dotEnvTracker.js';

describe('dotEnvTracker', () => {
  beforeEach(() => {
    clearDotEnvKeys();
  });

  it('starts empty', () => {
    expect(getDotEnvKeys().size).toBe(0);
  });

  it('records keys', () => {
    recordDotEnvKeys(['DB_DATABASE', 'DB_HOST', 'APP_ENV']);
    const keys = getDotEnvKeys();
    expect(keys.has('DB_DATABASE')).toBe(true);
    expect(keys.has('DB_HOST')).toBe(true);
    expect(keys.has('APP_ENV')).toBe(true);
  });

  it('accumulates across multiple calls', () => {
    recordDotEnvKeys(['DB_DATABASE']);
    recordDotEnvKeys(['DB_HOST']);
    expect(getDotEnvKeys().size).toBe(2);
  });

  it('deduplicates keys', () => {
    recordDotEnvKeys(['DB_DATABASE', 'DB_DATABASE']);
    expect(getDotEnvKeys().size).toBe(1);
  });

  it('clears all keys', () => {
    recordDotEnvKeys(['DB_DATABASE', 'DB_HOST']);
    clearDotEnvKeys();
    expect(getDotEnvKeys().size).toBe(0);
  });

  it('reflects subsequently recorded keys', () => {
    recordDotEnvKeys(['DB_DATABASE']);
    const keys = getDotEnvKeys();
    expect(keys.has('DB_DATABASE')).toBe(true);
    expect(keys.has('DB_HOST')).toBe(false);
    recordDotEnvKeys(['DB_HOST']);
    expect(getDotEnvKeys().has('DB_HOST')).toBe(true);
  });
});
