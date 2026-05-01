/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processRtlText } from './rtlUtils.js';

describe('rtlUtils', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should keep English text unchanged', () => {
    const input = 'Hello World';
    expect(processRtlText(input)).toBe(input);
  });

  it('should reorder a simple Arabic sentence', () => {
    // Input: "أهلاً بك"
    // Logical: [أ, ه, ل, ا, ً,  , ب, ك]
    // Visual (reversed): [ك, ب,  , ً, ا, ل, ه, أ]
    // 1603 is 'ك'
    const input = 'أهلاً بك';
    const result = processRtlText(input);
    expect(result).not.toBe(input);
    expect(result.charCodeAt(0)).toBe(1603); // starts with 'ك'
  });

  it('should bypass reordering when GEMINI_NATIVE_RTL=1', () => {
    vi.stubEnv('GEMINI_NATIVE_RTL', '1');
    const input = 'أهلاً بك';
    expect(processRtlText(input)).toBe(input);
  });
});
