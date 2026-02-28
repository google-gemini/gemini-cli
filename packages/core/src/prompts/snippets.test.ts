/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderTruthfulnessGuardrails } from './snippets.js';

describe('renderTruthfulnessGuardrails', () => {
  it('should contain the verification integrity mandate', () => {
    const result = renderTruthfulnessGuardrails();
    expect(result).toContain('Verification Integrity');
    expect(result).toContain('MUST NOT claim to have reviewed');
  });

  it('should contain the no assumed state mandate', () => {
    const result = renderTruthfulnessGuardrails();
    expect(result).toContain('No Assumed State');
    expect(result).toContain('Always read before asserting');
  });

  it('should contain the explicit uncertainty mandate', () => {
    const result = renderTruthfulnessGuardrails();
    expect(result).toContain('Explicit Uncertainty');
    expect(result).toContain('state the uncertainty explicitly');
  });

  it('should reference generic tool types', () => {
    const result = renderTruthfulnessGuardrails();
    expect(result).toContain('read, list, or search tools');
  });

  it('should be trimmed with no leading/trailing whitespace', () => {
    const result = renderTruthfulnessGuardrails();
    expect(result).toBe(result.trim());
  });

  it('should start with a markdown heading', () => {
    const result = renderTruthfulnessGuardrails();
    expect(result).toMatch(/^# Truthfulness/);
  });
});
