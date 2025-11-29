/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { spawnWrapper } from './spawnWrapper.js';

describe('spawnWrapper', () => {
  it('should be an alias for child_process.spawn', () => {
    expect(spawnWrapper).toBe(spawn);
  });
});
