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
    execSync: vi.fn(),
    spawnSync: vi.fn(() => ({ status: 0 })),
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
  });

  describe('VsCodeInstaller', () => {
    function setup({
      ide = IDE_DEFINITIONS.vscode,
      existsResult = false,
      execSync = () => '',
      platform = 'linux' as NodeJS.Platform,
    }: {
      ide?: IdeInfo;
      existsResult?: boolean;
      execSync?: () => string;
      platform?: NodeJS.Platform;
    } = {}) {
      vi.spyOn(child_process, 'execSync').mockImplementation(execSync);
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
            path.join('C:\\Program Files', 'Microsoft VS Code Insiders/bin/code-insiders.cmd'),  
            path.join(
              HOME_DIR,
              '/AppData/Local/Programs/Microsoft VS Code/bin/code.cmd',
            ),
            path.join(  
              HOME_DIR,  
              '/AppData/Local/Programs/Microsoft VS Code Insiders/bin/code-insiders.cmd',  
            ),  
          ],
        },
        {
          platform: 'darwin' as NodeJS.Platform,
          expectedLookupPaths: [
            '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
            '/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code-insiders',  

            path.join(HOME_DIR, 'Library/Application Support/Code/bin/code'),
            path.join(HOME_DIR, 'Library/Application Support/Code - Insiders/bin/code-insiders'),
          ],
        },
        {
          platform: 'linux' as NodeJS.Platform,
          expectedLookupPaths: [  
        '/usr/share/code/bin/code',  
        '/usr/share/code-insiders/bin/code-insiders',  
        '/snap/bin/code',  
        '/snap/bin/code-insiders',  
        path.join(HOME_DIR, '.local/share/code/bin/code'),  
        path.join(HOME_DIR, '.local/share/code-insiders/bin/code-insiders'),  
        ],  
        },
      ])(
        'identifies the path to code cli on platform: $platform',
        async ({ platform, expectedLookupPaths }) => {
          const { installer } = setup({
            platform,
            execSync: () => {
              throw new Error('Command not found'); // `code` is not in PATH
            },
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
          { stdio: 'pipe' },
        );
      });

      it('tries code command before code-insiders in PATH', async () => {  
        const { installer } = setup({  
          platform: 'linux',  
          execSync: vi.fn()  
            .mockImplementationOnce(() => {  
              throw new Error('code not found'); // First call for 'code' fails  
            })  
            .mockReturnValueOnce(''), // Second call for 'code-insiders' succeeds  
        });  
          
        await installer.install();  
          
        expect(child_process.execSync).toHaveBeenCalledWith('command -v code', {  
          stdio: 'ignore',  
        });  
        expect(child_process.execSync).toHaveBeenCalledWith('command -v code-insiders', {  
          stdio: 'ignore',  
        });  
      });  
        
      it('uses code command when both are available', async () => {  
        const { installer } = setup({  
          platform: 'linux',  
          execSync: () => '', // Both commands succeed  
        });  
          
        await installer.install();  
          
        expect(child_process.spawnSync).toHaveBeenCalledWith(  
          'code', // Should use 'code', not 'code-insiders'  
          [  
            '--install-extension',  
            'google.gemini-cli-vscode-ide-companion',  
            '--force',  
          ],  
          { stdio: 'pipe' },  
        );  
      });  
        
      it('uses code-insiders when code is not available', async () => {  
        const { installer } = setup({  
          platform: 'linux',  
          execSync: vi.fn()  
            .mockImplementationOnce(() => {  
              throw new Error('code not found');  
            })  
            .mockReturnValueOnce(''), // code-insiders found  
        });  
          
        await installer.install();  
          
        expect(child_process.spawnSync).toHaveBeenCalledWith(  
          'code-insiders',  
          [  
            '--install-extension',  
            'google.gemini-cli-vscode-ide-companion',  
            '--force',  
          ],  
          { stdio: 'pipe' },  
        );  
      });

      it('tries code.cmd before code-insiders.cmd on Windows', async () => {  
        const { installer } = setup({  
          platform: 'win32',  
          execSync: vi.fn()  
            .mockImplementationOnce(() => {  
              throw new Error('code.cmd not found');  
            })  
            .mockReturnValueOnce('C:\\Program Files\\Microsoft VS Code Insiders\\bin\\code-insiders.cmd'),  
        });  
          
        await installer.install();  
          
        expect(child_process.execSync).toHaveBeenCalledWith('where.exe code.cmd');  
        expect(child_process.execSync).toHaveBeenCalledWith('where.exe code-insiders.cmd');  
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
      'should return a failure message if neither code nor code-insiders is available',  
      async ({ ide, expectedErr }) => {  
        const { installer } = setup({  
          ide,  
          execSync: () => {  
            throw new Error('Command not found'); // Both commands fail  
          },  
          existsResult: false, // No installation paths found either  
        });  
        const result = await installer.install();  
        expect(result.success).toBe(false);  
        expect(result.message).toContain(expectedErr);  
      },  
    );
    });
  });
});
