/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { modelCommand } from './modelCommand.js';
import type { CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('modelCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('should have correct command metadata', () => {
    expect(modelCommand.name).toBe('model');
    expect(modelCommand.description).toBe('Select and switch Gemini models interactively');
    expect(modelCommand.subCommands).toBeUndefined();
  });

  it('should return dialog action when executed', () => {
    if (!modelCommand.action) throw new Error('Command has no action');

    const result = modelCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'dialog',
      dialog: 'model',
    });
  });

  it('should handle arguments gracefully', () => {
    if (!modelCommand.action) throw new Error('Command has no action');

    const result = modelCommand.action(mockContext, 'some-arg');

    expect(result).toEqual({
      type: 'dialog',
      dialog: 'model',
    });
  });
});
