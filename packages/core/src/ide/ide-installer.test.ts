/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    execSync: vi.fn(),
    spawnSync: vi.fn(() => ({ status: 0 })),
  };
});
vi.mock('node:fs');
vi.mock('node:os');
vi.mock('../utils/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths.js')>();
  return {
    ...actual,
    homedir: vi.fn(),
  };
});

import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { homedir as pathsHomedir } from '../utils/paths.js';
import { IDE_DEFINITIONS, type IdeInfo } from './detect-ide.js';
import { getIdeInstaller } from './ide-installer.js';

describe('ide-installer', () => {
  const HOME_DIR = '/home/user';

  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue(HOME_DIR);
    vi.mocked(pathsHomedir).mockReturnValue(HOME_DIR);
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
      spawnSync = () => ({ status: 0, stdout: Buffer.from('') }), // Mock default spawnSync behavior
      platform = 'linux' as NodeJS.Platform,
    }: {
      ide?: IdeInfo;
      existsResult?: boolean;
      spawnSync?: () => { status: number; stdout: Buffer | string };
      platform?: NodeJS.Platform;
    } = {}) {
      // @ts-expect-error - mockImplementation signature mismatch in vitest typings
      vi.spyOn(child_process, 'spawnSync').mockImplementation(spawnSync);
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
            spawnSync: () => 
               ({ status: 1, stdout: '' }) // Mock 'command not found' failure
            ,
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
          spawnSync: () => ({
            status: 0,
            stdout: 'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd\n',
          }),
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
            spawnSync: () => 
               ({ status: 1, stdout: '' }) // Command not found
            ,
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
    spawnSync = () => ({ status: 0, stdout: Buffer.from('') }),
    platform = 'linux' as NodeJS.Platform,
  }: {
    spawnSync?: () => { status: number; stdout: Buffer | string };
    platform?: NodeJS.Platform;
  } = {}) {
    // @ts-expect-error - mockImplementation signature mismatch in vitest typings
    vi.spyOn(child_process, 'spawnSync').mockImplementation(spawnSync);
    const installer = getIdeInstaller(IDE_DEFINITIONS.antigravity, platform)!;

    return { installer };
  }

  it('installs the extension using the alias', async () => {
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', 'agy');
    const { installer } = setup({
      spawnSync: () => ({ status: 0, stdout: Buffer.from('') }),
    });
    const result = await installer.install();

    expect(result.success).toBe(true);
    // Note: The second call to spawnSync is for the installation itself which we're not explicitly asserting on the mock's return value for here, but we are checking success.
    // However, verify spawnSync was called correctly for the installation
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

  it('uses fallback commands if the alias is not set', async () => {
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', '');
    const { installer } = setup({
      spawnSync: () => ({ status: 0, stdout: Buffer.from('') }),
    });
    const result = await installer.install();

    // Should succeed using fallback 'agy' command
    expect(result.success).toBe(true);
    expect(child_process.spawnSync).toHaveBeenCalledWith(
      'agy',
      expect.any(Array),
      expect.any(Object),
    );
  });

  it('returns a failure message if all commands are not found', async () => {
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', 'not-a-command');
    const { installer } = setup({
      spawnSync: () => 
         ({ status: 1, stdout: '' }) // Command not found
      ,
    });
    const result = await installer.install();

    expect(result.success).toBe(false);
    expect(result.message).toContain('Antigravity CLI not found');
    expect(result.message).toContain('not-a-command');
  });
});
