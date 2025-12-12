/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';

vi.mock('node:child_process', async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import('node:child_process');
  return {
    ...actual,
    spawnSync: vi.fn(() => ({ status: 0, stdout: '' })),
  };
});
vi.mock('fs');
vi.mock('os');

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getIdeInstaller } from './ide-installer.js';
import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { IDE_DEFINITIONS, type IdeInfo } from './detect-ide.js';

function mockCommandLookup({
  platform,
  status = 0,
  stdout = '',
}: {
  platform: NodeJS.Platform;
  status?: number;
  stdout?: string;
}) {
  return vi.spyOn(child_process, 'spawnSync').mockImplementation((cmd) => {
    const normalizedCommand = typeof cmd === 'string' ? cmd.toLowerCase() : '';
    const isLookup =
      platform === 'win32'
        ? normalizedCommand === 'where.exe'
        : normalizedCommand === 'command';
    if (isLookup) {
      return {
        status,
        stdout,
        stderr: '',
      };
    }
    return {
      status: 0,
      stdout: '',
      stderr: '',
    };
  });
}

describe('ide-installer', () => {
  const HOME_DIR = '/home/user';

  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue(HOME_DIR);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getIdeInstaller', () => {
    it.each([
      { ide: IDE_DEFINITIONS.vscode },
      { ide: IDE_DEFINITIONS.firebasestudio },
    ])('returns a VsCodeInstaller for "$ide.name"', ({ ide }) => {
      const installer = getIdeInstaller(ide);

      expect(installer).not.toBeNull();
      expect(installer?.install).toEqual(expect.any(Function));
    });

    it('returns an AntigravityInstaller for "antigravity"', () => {
      const installer = getIdeInstaller(IDE_DEFINITIONS.antigravity);

      expect(installer).not.toBeNull();
      expect(installer?.install).toEqual(expect.any(Function));
    });
  });

  describe('VsCodeInstaller', () => {
    function setup({
      ide = IDE_DEFINITIONS.vscode,
      existsResult = false,
      platform = 'linux' as NodeJS.Platform,
      commandLookupStatus = 0,
      commandLookupStdout = '',
    }: {
      ide?: IdeInfo;
      existsResult?: boolean;
      platform?: NodeJS.Platform;
      commandLookupStatus?: number;
      commandLookupStdout?: string;
    } = {}) {
      mockCommandLookup({
        platform,
        status: commandLookupStatus,
        stdout: commandLookupStdout,
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(existsResult);
      const installer = getIdeInstaller(ide, platform)!;

      return { installer };
    }

    describe('install', () => {
      it.each([
        {
          platform: 'win32' as NodeJS.Platform,
          expectedLookupPaths: [
            path.join('C:\\Program Files', 'Microsoft VS Code/bin/code.cmd'),
            path.join(
              HOME_DIR,
              '/AppData/Local/Programs/Microsoft VS Code/bin/code.cmd',
            ),
          ],
        },
        {
          platform: 'darwin' as NodeJS.Platform,
          expectedLookupPaths: [
            '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
            path.join(HOME_DIR, 'Library/Application Support/Code/bin/code'),
          ],
        },
        {
          platform: 'linux' as NodeJS.Platform,
          expectedLookupPaths: ['/usr/share/code/bin/code'],
        },
      ])(
        'identifies the path to code cli on platform: $platform',
        async ({ platform, expectedLookupPaths }) => {
          const { installer } = setup({
            platform,
            commandLookupStatus: 1,
          });
          await installer.install();
          for (const [idx, path] of expectedLookupPaths.entries()) {
            expect(fs.existsSync).toHaveBeenNthCalledWith(idx + 1, path);
          }
        },
      );

      it('installs the extension using code cli', async () => {
        const { installer } = setup({
          platform: 'linux',
        });
        await installer.install();
        expect(child_process.spawnSync).toHaveBeenCalledWith(
          'code',
          [
            '--install-extension',
            'google.gemini-cli-vscode-ide-companion',
            '--force',
          ],
          { stdio: 'pipe', shell: false },
        );
      });

      it('installs the extension using code cli on windows', async () => {
        const { installer } = setup({
          platform: 'win32',
          commandLookupStdout:
            'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd',
        });
        await installer.install();
        expect(child_process.spawnSync).toHaveBeenCalledWith(
          'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd',
          [
            '--install-extension',
            'google.gemini-cli-vscode-ide-companion',
            '--force',
          ],
          { stdio: 'pipe', shell: true },
        );
      });

      it.each([
        {
          ide: IDE_DEFINITIONS.vscode,
          expectedMessage:
            'VS Code companion extension was installed successfully',
        },
        {
          ide: IDE_DEFINITIONS.firebasestudio,
          expectedMessage:
            'Firebase Studio companion extension was installed successfully',
        },
      ])(
        'returns that the cli was installed successfully',
        async ({ ide, expectedMessage }) => {
          const { installer } = setup({ ide });
          const result = await installer.install();
          expect(result.success).toBe(true);
          expect(result.message).toContain(expectedMessage);
        },
      );

      it.each([
        {
          ide: IDE_DEFINITIONS.vscode,
          expectedErr: 'VS Code CLI not found',
        },
        {
          ide: IDE_DEFINITIONS.firebasestudio,
          expectedErr: 'Firebase Studio CLI not found',
        },
      ])(
        'should return a failure message if $ide is not installed',
        async ({ ide, expectedErr }) => {
          const { installer } = setup({
            ide,
            commandLookupStatus: 1,
            existsResult: false,
          });
          const result = await installer.install();
          expect(result.success).toBe(false);
          expect(result.message).toContain(expectedErr);
        },
      );
    });
  });
});

describe('AntigravityInstaller', () => {
  function setup({
    platform = 'linux' as NodeJS.Platform,
    commandLookupStatus = 0,
    commandLookupStdout = 'agy',
  }: {
    platform?: NodeJS.Platform;
    commandLookupStatus?: number;
    commandLookupStdout?: string;
  } = {}) {
    mockCommandLookup({
      platform,
      status: commandLookupStatus,
      stdout: commandLookupStdout,
    });
    const installer = getIdeInstaller(IDE_DEFINITIONS.antigravity, platform)!;

    return { installer };
  }

  it('installs the extension using the alias', async () => {
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', 'agy');
    const { installer } = setup({});
    const result = await installer.install();

    expect(result.success).toBe(true);
    expect(child_process.spawnSync).toHaveBeenCalledWith(
      'agy',
      [
        '--install-extension',
        'google.gemini-cli-vscode-ide-companion',
        '--force',
      ],
      { stdio: 'pipe', shell: false },
    );
  });

  it('passes alias to command lookup without shell interpretation', async () => {
    const alias = 'agy && rm -rf /';
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', alias);
    const { installer } = setup({
      commandLookupStdout: alias,
    });
    await installer.install();

    expect(child_process.spawnSync).toHaveBeenNthCalledWith(
      1,
      'command',
      ['-v', alias],
      expect.objectContaining({ stdio: 'ignore', shell: false }),
    );
  });

  it('returns a failure message if the alias is not set', async () => {
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', '');
    const { installer } = setup({});
    const result = await installer.install();

    expect(result.success).toBe(false);
    expect(result.message).toContain(
      'ANTIGRAVITY_CLI_ALIAS environment variable not set',
    );
  });

  it('returns a failure message if the command is not found', async () => {
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', 'not-a-command');
    const { installer } = setup({
      commandLookupStatus: 1,
    });
    const result = await installer.install();

    expect(result.success).toBe(false);
    expect(result.message).toContain('not-a-command not found');
  });
});
