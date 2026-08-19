/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { helpCommand } from './helpCommand.js';
import { CommandKind, type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';

describe('helpCommand', () => {
  let mockContext: CommandContext;
  const originalPlatform = process.platform;
  const action = helpCommand.action;

  if (!action) {
    throw new Error('Help command has no action');
  }

  beforeEach(() => {
    mockContext = createMockCommandContext({
      ui: {
        addItem: vi.fn(),
      },
    } as unknown as CommandContext);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('should add a help message to the UI history by default', async () => {
    await action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.HELP,
        timestamp: expect.any(Date),
      }),
    );
  });

  it('should have the correct command properties', () => {
    expect(helpCommand.name).toBe('help');
    expect(helpCommand.kind).toBe(CommandKind.BUILT_IN);
    expect(helpCommand.description).toBe('For help on gemini-cli');
  });

  describe('Antigravity installer commands help', () => {
    it('should output macOS installation command on darwin platform', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      await action(mockContext, 'install antigravity cli');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: `To install the Antigravity CLI on macOS, run the following command:\n\n'curl -fsSL https://antigravity.google/cli/install.sh | bash'`,
        }),
      );
    });

    it('should output Linux installation command on linux platform', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      await action(mockContext, 'how do I install antigravity CLI');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: `To install the Antigravity CLI on Linux, run the following command:\n\n'curl -fsSL https://antigravity.google/cli/install.sh | bash'`,
        }),
      );
    });

    it('should output Windows PowerShell installation command on win32 when PSModulePath is set', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.stubEnv('PSModulePath', 'C:\\some\\path');

      await action(mockContext, 'how do I migrate to antigravity CLI');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: `To install the Antigravity CLI on Windows (PowerShell), run the following command:\n\n'irm https://antigravity.google/cli/install.ps1 | iex'`,
        }),
      );
    });

    it('should output Windows CMD installation command on win32 when PSModulePath is not set', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.stubEnv('PSModulePath', '');

      await action(mockContext, 'install antigravity cli');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: `To install the Antigravity CLI on Windows (Command Prompt), run the following command:\n\n'curl -fsSL https://antigravity.google/cli/install.cmd -o install.cmd && install.cmd && del install.cmd'`,
        }),
      );
    });

    it('should learn more message on unsupported platform', async () => {
      Object.defineProperty(process, 'platform', { value: 'freebsd' });

      await action(mockContext, 'install antigravity cli');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'Learn more about Antigravity CLI at https://antigravity.google/docs/cli-getting-started',
        }),
      );
    });

    it('should fall back to default help if query does not contain install or migrate', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      await action(mockContext, 'antigravity cli');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.HELP,
        }),
      );
    });
  });
});
