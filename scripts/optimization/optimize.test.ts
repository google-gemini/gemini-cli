/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { maskVariables, unmaskVariables } from './masking.js';

vi.mock('node:fs');

describe('Optimization Pipeline Infrastructure', () => {
  // --- Masking Tests ---
  describe('Masking Utility', () => {
    it('should mask unique template variables and restore them', () => {
      const input =
        'Use ${TOOL_A} to read ${FILE_PATH}. ${TOOL_A} is efficient.';
      const { maskedText, maskMap } = maskVariables(input);

      expect(maskedText).toContain('[[GCLI_VAR_0]]');
      expect(maskedText).not.toContain('${TOOL_A}');

      const restored = unmaskVariables(maskedText, maskMap);
      expect(restored).toBe(input);
    });

    it('should handle text with no variables', () => {
      const input = 'Static text.';
      const { maskedText, maskMap } = maskVariables(input);
      expect(maskedText).toBe(input);
      expect(Object.keys(maskMap).length).toBe(0);
    });
  });

  // Note: Extraction tests remain in extract.test.ts
  // Optimization logic is verified via dry runs and Pareto frontier outputs.
});
