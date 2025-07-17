/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { editorCommand } from './editorCommand.js';
// 1. Import the mock context utility
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('editorCommand', () => {
  it('should return a dialog action to open the editor dialog', () => {
    if (!editorCommand.action) {
      throw new Error('The editor command must have an action.');
    }
    const mockContext = createMockCommandContext();
    const result = editorCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'dialog',
      dialog: 'editor',
    });
  });

  it('should have the correct name and description', () => {
    expect(editorCommand.name).toBe('editor');
    expect(editorCommand.description).toBe('set external editor preference');
  });
});
