/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { editorCommand } from './editorCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('editorCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('should return a dialog action to open the editor dialog', () => {
    if (!editorCommand.action) {
      throw new Error('The editor command must have an action.');
    }

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
