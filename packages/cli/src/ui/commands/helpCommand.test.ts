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

const mockGetAntigravityCompatibility = vi.fn();
vi.mock('../utils/antigravityUtils.js', () => ({
  getAntigravityCompatibility: () => mockGetAntigravityCompatibility(),
}));

describe('helpCommand', () => {
  let mockContext: CommandContext;
  const originalPlatform = process.platform;
  const action = helpCommand.action;

  if (!action) {
    throw new Error('Help command has no action');
  }

  beforeEach(() => {
    mockGetAntigravityCompatibility.mockReset();
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
    it('should output macOS installation command on compatible darwin platform', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockGetAntigravityCompatibility.mockReturnValue({
        installInfo: {
          platformName: 'macOS',
          installCmd:
            'curl -fsSL https://antigravity.google/cli/install.sh | bash',
        },
        cpuCompatible: true,
        incompatibilityReason: '',
      });

      await action(mockContext, 'install antigravity cli');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: `To install the Antigravity CLI on macOS, run the following command:\n\n'curl -fsSL https://antigravity.google/cli/install.sh | bash'`,
        }),
      );
    });

    it('should output Linux installation command on compatible linux platform', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockGetAntigravityCompatibility.mockReturnValue({
        installInfo: {
          platformName: 'Linux',
          installCmd:
            'curl -fsSL https://antigravity.google/cli/install.sh | bash',
        },
        cpuCompatible: true,
        incompatibilityReason: '',
      });

      await action(mockContext, 'how do I install antigravity CLI');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: `To install the Antigravity CLI on Linux, run the following command:\n\n'curl -fsSL https://antigravity.google/cli/install.sh | bash'`,
        }),
      );
    });

    it('should output Windows PowerShell installation command on compatible win32 when PSModulePath is set', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.stubEnv('PSModulePath', 'C:\\some\\path');
      mockGetAntigravityCompatibility.mockReturnValue({
        installInfo: {
          platformName: 'Windows (PowerShell)',
          installCmd: 'irm https://antigravity.google/cli/install.ps1 | iex',
        },
        cpuCompatible: true,
        incompatibilityReason: '',
      });

      await action(mockContext, 'how do I migrate to antigravity CLI');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: `To install the Antigravity CLI on Windows (PowerShell), run the following command:\n\n'irm https://antigravity.google/cli/install.ps1 | iex'`,
        }),
      );
    });

    it('should output Windows CMD installation command on compatible win32 when PSModulePath is not set', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.stubEnv('PSModulePath', '');
      mockGetAntigravityCompatibility.mockReturnValue({
        installInfo: {
          platformName: 'Windows (Command Prompt)',
          installCmd:
            'curl -fsSL https://antigravity.google/cli/install.cmd -o install.cmd && install.cmd && del install.cmd',
        },
        cpuCompatible: true,
        incompatibilityReason: '',
      });

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
      mockGetAntigravityCompatibility.mockReturnValue({
        installInfo: null,
        cpuCompatible: true,
        incompatibilityReason: '',
      });

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

    it('should show hardware incompatibility warning for legacy CPUs instead of install command (issue #27342)', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockGetAntigravityCompatibility.mockReturnValue({
        installInfo: {
          platformName: 'Linux',
          installCmd:
            'curl -fsSL https://antigravity.google/cli/install.sh | bash',
        },
        cpuCompatible: false,
        incompatibilityReason:
          'Your CPU (AMD A6-3420M APU) lacks required instruction sets: AVX, AVX2.',
      });

      await action(mockContext, 'install antigravity cli');

      const addItemCall = (mockContext.ui.addItem as ReturnType<typeof vi.fn>)
        .mock.calls[0][0] as { type: string; text: string };

      expect(addItemCall.type).toBe(MessageType.INFO);
      expect(addItemCall.text).toContain('Hardware Compatibility Issue');
      expect(addItemCall.text).toContain('AMD A6-3420M');
      expect(addItemCall.text).toContain('issues/27342');
      // Should NOT contain install instructions
      expect(addItemCall.text).not.toContain('To install');
    });

    it('should also trigger on "antigravity cpu" or "antigravity compat" queries', async () => {
      mockGetAntigravityCompatibility.mockReturnValue({
        installInfo: {
          platformName: 'Linux',
          installCmd:
            'curl -fsSL https://antigravity.google/cli/install.sh | bash',
        },
        cpuCompatible: true,
        incompatibilityReason: '',
      });

      await action(mockContext, 'antigravity cpu compatibility');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
        }),
      );
    });
  });
});
