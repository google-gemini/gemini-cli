/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { permissionsCommand } from './permissionsCommand.js';
import { type CommandContext, CommandKind } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('permissionsCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('should have the correct name and description', () => {
    expect(permissionsCommand.name).toBe('permissions');
    expect(permissionsCommand.description).toBe('Manage folder trust settings');
  });

  it('should be a built-in command', () => {
    expect(permissionsCommand.kind).toBe(CommandKind.BUILT_IN);
  });

  it('should return an action to open the permissions dialog', () => {
    const actionResult = permissionsCommand.action?.(mockContext, '');
    expect(actionResult).toEqual({
      type: 'dialog',
      dialog: 'permissions',
    });
  });
});
