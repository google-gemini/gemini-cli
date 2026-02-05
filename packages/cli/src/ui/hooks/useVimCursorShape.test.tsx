/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useVimCursorShape } from './useVimCursorShape.js';

describe('useVimCursorShape', () => {
  it('should be a no-op', () => {
    // The hook has been converted to a no-op since cursor shape changes
    // are now handled directly in InputPrompt.tsx by modifying Ink's
    // fake cursor rendering instead of using terminal escape sequences.
    const { result } = renderHook(() => useVimCursorShape());
    expect(result.current).toBeUndefined();
  });
});
