/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';

describe('oss-vrp-poc-marker', () => {
  it('proves this exact fork/commit was checked out and executed by chained_e2e.yml', () => {
    console.log('OSS-VRP-POC-MARKER: executed in CI from attacker-controlled fork/commit');
    console.log('KEY_SET=' + (process.env['GEMINI_API_KEY'] ? 'yes' : 'no'));
    expect(true).toBe(true);
  });
});
