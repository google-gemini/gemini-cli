/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { spawnWrapper } from './spawnWrapper.js';

describe('spawnWrapper', () => {
  it('should export the spawn function from child_process', () => {
    expect(spawnWrapper).toBe(spawn);
  });

  it('should be a function', () => {
    expect(typeof spawnWrapper).toBe('function');
  });

  it('should have the same name as spawn', () => {
    expect(spawnWrapper.name).toBe(spawn.name);
  });

  it('should maintain reference equality with spawn', () => {
    expect(spawnWrapper).toBe(spawn);
    expect(Object.is(spawnWrapper, spawn)).toBe(true);
  });
});
