/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getIdeInstaller } from './ide-installer.js';
import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DetectedIde } from './detect-ide.js';

vi.mock('child_process');
vi.mock('fs');
vi.mock('os');

describe('ide-installer', () => {
  const HOME_DIR = '/home/user';

  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue(HOME_DIR);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getIdeInstaller', () => {
    it.each([{ ide: DetectedIde.VSCode }, { ide: DetectedIde.FirebaseStudio }])(
      'returns a VsCodeInstaller for "$ide"',
      ({ ide }) => {
        const installer = getIdeInstaller(ide);

        expect(installer).not.toBeNull();
        expect(installer?.install).toEqual(expect.any(Function));
      },
    );
  });

  describe('VsCodeInstaller', () => {
    function setup({
      ide = DetectedIde.VSCode,
      existsResult = false,
      execSync = () => '',
      platform = 'linux' as NodeJS.Platform,
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
        expect(child_process.execSync).toHaveBeenCalledWith(
          '"code" --install-extension google.gemini-cli-vscode-ide-companion --force',
          { stdio: 'pipe' },
        );
      });

      it.each([
        {
          ide: DetectedIde.VSCode,
          expectedMessage:
            'VS Code companion extension was installed successfully',
        },
        {
          ide: DetectedIde.FirebaseStudio,
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
        { ide: DetectedIde.VSCode, expectedErr: 'VS Code CLI not found' },
        {
          ide: DetectedIde.FirebaseStudio,
          expectedErr: 'Firebase Studio CLI not found',
        },
      ])(
        'should return a failure message if $ide is not installed',
        async ({ ide, expectedErr }) => {
          const { installer } = setup({
            ide,
            execSync: () => {
              throw new Error('Command not found');
            },
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
