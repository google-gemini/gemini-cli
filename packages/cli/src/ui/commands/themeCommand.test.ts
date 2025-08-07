/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { themeCommand } from './themeCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('themeCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('should return a dialog action to open the theme dialog', () => {
    // Ensure the command has an action to test.
    if (!themeCommand.action) {
      throw new Error('The theme command must have an action.');
    }

    const result = themeCommand.action(mockContext, '');

    // Assert that the action returns the correct object to trigger the theme dialog.
    expect(result).toEqual({
      type: 'dialog',
      dialog: 'theme',
    });
  });

  it('should have the correct name and description', () => {
    expect(themeCommand.name).toBe('theme');
    expect(themeCommand.description).toBe('change the theme');
  });
});
