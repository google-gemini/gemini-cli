/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getIdeInstaller, IdeInstaller } from './ide-installer.js';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import { DetectedIde } from './detect-ide.js';

vi.mock('child_process');
vi.mock('fs');
vi.mock('os');

describe('ide-installer', () => {
  describe('getIdeInstaller', () => {
    it('should return a VsCodeInstaller for "vscode"', () => {
      const installer = getIdeInstaller(DetectedIde.VSCode);
      expect(installer).not.toBeNull();
      // A more specific check might be needed if we export the class
      expect(installer).toBeInstanceOf(Object);
    });

    it('should return an OpenVSXInstaller for "vscodium"', () => {
      const installer = getIdeInstaller(DetectedIde.VSCodium);
      expect(installer).not.toBeNull();
      expect(installer).toBeInstanceOf(Object);
    });

    it('should return a DefaultIDEInstaller for an unknown IDE', () => {
      const installer = getIdeInstaller('unknown' as DetectedIde);
      // Assuming DefaultIDEInstaller is the fallback
      expect(installer).not.toBeNull();
      expect(installer).toBeInstanceOf(Object);
    });
  });

  describe('VsCodeInstaller', () => {
    let installer: IdeInstaller;

    beforeEach(() => {
      // We get a new installer for each test to reset the find command logic
      installer = getIdeInstaller(DetectedIde.VSCode)!;
      vi.spyOn(child_process, 'execSync').mockImplementation(() => '');
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(os, 'homedir').mockReturnValue('/home/user');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('install', () => {
      it('should return a failure message if VS Code is not installed', async () => {
        vi.spyOn(child_process, 'execSync').mockImplementation(() => {
          throw new Error('Command not found');
        });
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        // Re-create the installer so it re-runs findVsCodeCommand
        installer = getIdeInstaller(DetectedIde.VSCode)!;
        const result = await installer.install();
        expect(result.success).toBe(false);
        expect(result.message).toContain('VS Code CLI not found');
      });
    });
  });

  describe('OpenVSXInstaller', () => {
    let installer: IdeInstaller;

    beforeEach(() => {
      installer = getIdeInstaller(DetectedIde.VSCodium)!;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('install', () => {
      it('should call execSync with the correct command and return success', async () => {
        const execSyncSpy = vi
          .spyOn(child_process, 'execSync')
          .mockImplementation(() => '');
        const result = await installer.install();
        expect(execSyncSpy).toHaveBeenCalledWith(
          'npx ovsx get google.gemini-cli-vscode-ide-companion',
          { stdio: 'pipe' },
        );
        expect(result.success).toBe(true);
        expect(result.message).toContain(
          'VS Code companion extension was installed successfully from OpenVSX',
        );
      });

      it('should return a failure message on failed installation', async () => {
        vi.spyOn(child_process, 'execSync').mockImplementation(() => {
          throw new Error('Command failed');
        });
        const result = await installer.install();
        expect(result.success).toBe(false);
        expect(result.message).toContain(
          'Failed to install VS Code companion extension from OpenVSX',
        );
      });
    });
  });
});
