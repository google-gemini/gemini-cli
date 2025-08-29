/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { permissionsCommand } from './permissionsCommand.js';
import { CommandKind, type CommandContext } from './types.js';

describe('permissionsCommand', () => {
  it('should have correct basic properties', () => {
    expect(permissionsCommand.name).toBe('permissions');
    expect(permissionsCommand.description).toBe(
      'Manage tool permissions and reset "Always Allow" settings',
    );
    expect(permissionsCommand.kind).toBe(CommandKind.BUILT_IN);
  });

  it('should return dialog action when executed', () => {
    const mockContext = {
      services: { config: {} },
      ui: { addItem: vi.fn() },
    } as unknown as CommandContext;

    const result = permissionsCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'dialog',
      dialog: 'permissions',
    });
  });

  it('should ignore arguments and always return the same result', () => {
    const mockContext = {
      services: { config: {} },
      ui: { addItem: vi.fn() },
    } as unknown as CommandContext;

    const result1 = permissionsCommand.action!(mockContext, '');
    const result2 = permissionsCommand.action!(mockContext, 'some arguments');
    const result3 = permissionsCommand.action!(
      mockContext,
      '--flag --another-flag',
    );

    expect(result1).toEqual(result2);
    expect(result2).toEqual(result3);
    expect(result1).toEqual({
      type: 'dialog',
      dialog: 'permissions',
    });
  });

  it('should not have subcommands', () => {
    expect(permissionsCommand.subCommands).toBeUndefined();
  });

  it('should not have alternative names', () => {
    expect(permissionsCommand.altNames).toBeUndefined();
  });

  it('should be synchronous', () => {
    const mockContext = {
      services: { config: {} },
      ui: { addItem: vi.fn() },
    } as unknown as CommandContext;

    const result = permissionsCommand.action!(mockContext, '');

    // Should return immediately, not a Promise
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof result).toBe('object');
  });
});
