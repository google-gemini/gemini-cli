/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { INFORMATIVE_TIPS } from './tips.js';

describe('INFORMATIVE_TIPS', () => {
  it('should mention both /chat and /resume for checkpoint tips', () => {
    expect(INFORMATIVE_TIPS).toContain(
      'List your saved chat checkpoints with /chat list or /resume list',
    );
    expect(INFORMATIVE_TIPS).toContain(
      'Save your current conversation with /chat save <tag> or /resume save <tag>',
    );
    expect(INFORMATIVE_TIPS).toContain(
      'Resume a saved conversation with /chat resume <tag> or /resume resume <tag>',
    );
    expect(INFORMATIVE_TIPS).toContain(
      'Delete a conversation checkpoint with /chat delete <tag> or /resume delete <tag>',
    );
    expect(INFORMATIVE_TIPS).toContain(
      'Share your conversation to a file with /chat share <file> or /resume share <file>',
    );
  });
});
