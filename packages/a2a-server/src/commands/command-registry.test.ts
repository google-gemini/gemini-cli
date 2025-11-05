/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('CommandRegistry', () => {
  const mockListExtensionsCommandInstance = {
    names: ['extensions', 'extensions list'],
    execute: vi.fn(),
  };
  const mockListExtensionsCommand = vi.fn(
    () => mockListExtensionsCommandInstance,
  );

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('./list-extensions', () => ({
      ListExtensionsCommand: mockListExtensionsCommand,
    }));
  });

  it('should register ListExtensionsCommand on initialization', async () => {
    const { commandRegistry } = await import('./command-registry.js');
    expect(mockListExtensionsCommand).toHaveBeenCalled();
    const command = commandRegistry.get('extensions');
    expect(command).toBe(mockListExtensionsCommandInstance);
  });

  it('get() should return undefined for a non-existent command', async () => {
    const { commandRegistry } = await import('./command-registry.js');
    const command = commandRegistry.get('non-existent');
    expect(command).toBeUndefined();
  });

  it('register() should register a new command', async () => {
    const { commandRegistry } = await import('./command-registry.js');
    const mockCommand = {
      names: ['test-command'],
      execute: vi.fn(),
    };
    commandRegistry.register(mockCommand);
    const command = commandRegistry.get('test-command');
    expect(command).toBe(mockCommand);
  });
});
