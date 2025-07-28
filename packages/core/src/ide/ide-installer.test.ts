/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getIdeInstaller, IdeInstaller } from './ide-installer.js';
import * as child_process from 'child_process';
import { DetectedIde } from './detect-ide.js';

vi.mock('child_process');

describe('ide-installer', () => {
  describe('getIdeInstaller', () => {
    it('should return a VsCodeInstaller for "vscode"', () => {
      const installer = getIdeInstaller(DetectedIde.VSCode);
      expect(installer).not.toBeNull();
      expect(installer).toBeInstanceOf(Object);
    });
  });

  describe('VsCodeInstaller', () => {
    let installer: IdeInstaller;

    beforeEach(() => {
      installer = getIdeInstaller(DetectedIde.VSCode)!;
      vi.spyOn(child_process, 'execSync').mockImplementation(() => '');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('isInstalled', () => {
      it('should return true if the command succeeds', () => {
        expect(installer.isInstalled()).toBe(true);
      });

      it('should return false if the command fails', () => {
        vi.spyOn(child_process, 'execSync').mockImplementation(() => {
          throw new Error('Command not found');
        });
        expect(installer.isInstalled()).toBe(false);
      });
    });

    describe('install', () => {
      it('should return a failure message if VS Code is not installed', async () => {
        vi.spyOn(child_process, 'execSync').mockImplementation(() => {
          throw new Error('Command not found');
        });
        const result = await installer.install();
        expect(result.success).toBe(false);
        expect(result.message).toContain('not found in your PATH');
      });
    });
  });
});
