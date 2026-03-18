/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderOperationalGuidelines } from './snippets.js';

describe('renderOperationalGuidelines - memoryManagerEnabled', () => {
  const baseOptions = {
    interactive: true,
    interactiveShellEnabled: false,
    topicUpdateNarration: false,
    memoryManagerEnabled: false,
  };

  it('should include save_memory tool snippet when memoryManagerEnabled is false', () => {
    const result = renderOperationalGuidelines(baseOptions);
    expect(result).toContain('save_memory');
  });

  it('should include save_memory tool snippet when memoryManagerEnabled is true', () => {
    const result = renderOperationalGuidelines({
      ...baseOptions,
      memoryManagerEnabled: true,
    });
    expect(result).toContain('save_memory');
  });
});
