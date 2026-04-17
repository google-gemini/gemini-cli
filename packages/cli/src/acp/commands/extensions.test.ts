/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DisableExtensionCommand, UninstallExtensionCommand } from './extensions.js';
import type { CommandContext } from './types.js';
import { ExtensionManager } from '../../config/extension-manager.js';

// Minimal mock of Config that returns a mock ExtensionManager
function createMockContext(overrides: {
  disableExtension?: (...args: unknown[]) => Promise<void>;
  uninstallExtension?: (...args: unknown[]) => Promise<void>;
  getExtensions?: () => { name: string; isActive: boolean }[];
}): CommandContext {
  const extensionManager = {
    disableExtension:
      overrides.disableExtension ?? vi.fn().mockResolvedValue(undefined),
    uninstallExtension:
      overrides.uninstallExtension ?? vi.fn().mockResolvedValue(undefined),
    getExtensions: overrides.getExtensions ?? vi.fn().mockReturnValue([]),
  };

  // Make the mock pass the `instanceof ExtensionManager` check
  Object.setPrototypeOf(extensionManager, ExtensionManager.prototype);

  return {
    config: {
      getExtensionLoader: () => extensionManager,
    },
  } as unknown as CommandContext;
}

describe('DisableExtensionCommand', () => {
  let command: DisableExtensionCommand;

  beforeEach(() => {
    command = new DisableExtensionCommand();
  });

  it('returns error when disabling fails', async () => {
    const context = createMockContext({
      disableExtension: vi.fn().mockRejectedValue(
        new Error('Extension with name test-ext does not exist.'),
      ),
    });

    const result = await command.execute(context, ['test-ext']);

    expect(result.name).toBe('extensions disable');
    expect(result.data).toContain('Failed to disable "test-ext"');
    expect(result.data).toContain(
      'Extension with name test-ext does not exist.',
    );
  });

  it('returns usage message when no args provided', async () => {
    const context = createMockContext({});
    const result = await command.execute(context, []);

    expect(result.data).toContain('Usage:');
    expect(result.data).toContain('/extensions disable');
  });

  it('reports success when disable succeeds', async () => {
    const context = createMockContext({
      disableExtension: vi.fn().mockResolvedValue(undefined),
    });

    const result = await command.execute(context, ['my-extension']);

    expect(result.data).toContain('Extension "my-extension" disabled');
  });
});

describe('UninstallExtensionCommand', () => {
  let command: UninstallExtensionCommand;

  beforeEach(() => {
    command = new UninstallExtensionCommand();
  });

  it('returns error when uninstalling a non-existent extension', async () => {
    const context = createMockContext({
      uninstallExtension: vi.fn().mockRejectedValue(
        new Error('Extension not found.'),
      ),
    });

    const result = await command.execute(context, ['nonexistent-ext']);

    expect(result.name).toBe('extensions uninstall');
    expect(result.data).toContain(
      'Failed to uninstall extension "nonexistent-ext"',
    );
    expect(result.data).toContain('Extension not found.');
  });

  it('returns usage message when no args and no --all flag', async () => {
    const context = createMockContext({});
    const result = await command.execute(context, []);

    expect(result.data).toContain('Usage:');
    expect(result.data).toContain('/extensions uninstall');
  });

  it('reports success when uninstall succeeds', async () => {
    const context = createMockContext({
      uninstallExtension: vi.fn().mockResolvedValue(undefined),
    });

    const result = await command.execute(context, ['my-extension']);

    expect(result.data).toContain(
      'Extension "my-extension" uninstalled successfully.',
    );
  });

  it('reports "No extensions installed" for --all with empty list', async () => {
    const context = createMockContext({
      getExtensions: vi.fn().mockReturnValue([]),
    });

    const result = await command.execute(context, ['--all']);

    expect(result.data).toBe('No extensions installed.');
  });
});
