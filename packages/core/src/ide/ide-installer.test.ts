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

    it('should return null for an unknown IDE', () => {
      const installer = getIdeInstaller('unknown' as DetectedIde);
      expect(installer).toBeNull();
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
});
