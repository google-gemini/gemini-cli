/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { authCommand } from './authCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('authCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('should return a dialog action to open the auth dialog', () => {
    if (!authCommand.action) {
      throw new Error('The auth command must have an action.');
    }

    const result = authCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'dialog',
      dialog: 'auth',
    });
  });

  it('should have the correct name and description', () => {
    expect(authCommand.name).toBe('auth');
    expect(authCommand.description).toBe('change the auth method');
  });
});
