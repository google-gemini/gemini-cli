/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { maskVariables, unmaskVariables } from './masking.js';

describe('optimization masking utility', () => {
  it('should mask unique template variables with indexed tokens', () => {
    const input = 'Use ${TOOL_A} to read ${FILE_PATH}. ${TOOL_A} is efficient.';
    const { maskedText, maskMap } = maskVariables(input);

    expect(maskedText).toContain('[[GCLI_VAR_0]]');
    expect(maskedText).toContain('[[GCLI_VAR_1]]');
    // Ensure all occurrences of the same variable are replaced with the same token
    const toolAToken = Object.keys(maskMap).find(
      (key) => maskMap[key] === '${TOOL_A}',
    )!;
    const count = maskedText.split(toolAToken).length - 1;
    expect(count).toBe(2);
    expect(maskedText).not.toContain('${TOOL_A}');
  });

  it('should perfectly restore original text during unmasking', () => {
    const original = 'Update ${OLD_STR} with ${NEW_STR} in ${FILE_PATH}.';
    const { maskedText, maskMap } = maskVariables(original);
    const restored = unmaskVariables(maskedText, maskMap);

    expect(restored).toBe(original);
  });

  it('should handle text with no variables', () => {
    const input = 'Static text with no placeholders.';
    const { maskedText, maskMap } = maskVariables(input);

    expect(maskedText).toBe(input);
    expect(Object.keys(maskMap).length).toBe(0);
  });
});
