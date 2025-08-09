/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';
import { InstallationManager } from './installationManager.js';
import { Storage } from '../config/storage.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'crypto';

vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof import('os')>();
  return {
    ...os,
    homedir: vi.fn(),
  };
});

vi.mock('crypto', async (importOriginal) => {
  const crypto = await importOriginal<typeof import('crypto')>();
  return {
    ...crypto,
    randomUUID: vi.fn(),
  };
});

describe('InstallationManager', () => {
  let tempHomeDir: string;
  let installationManager: InstallationManager;
  let storage: Storage;
  const installationIdFile = () =>
    path.join(tempHomeDir, '.gemini', 'tmp', 'installation_id');

  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    (os.homedir as Mock).mockReturnValue(tempHomeDir);
    storage = new Storage(tempHomeDir);
    installationManager = new InstallationManager(storage);
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('getInstallationId', () => {
    it('should create and write a new installation ID if one does not exist', () => {
      const newId = 'new-uuid-123';
      (randomUUID as Mock).mockReturnValue(newId);

      const installationId = installationManager.getInstallationId();

      expect(installationId).toBe(newId);
      expect(fs.existsSync(installationIdFile())).toBe(true);
      expect(fs.readFileSync(installationIdFile(), 'utf-8')).toBe(newId);
    });

    it('should read an existing installation ID from a file', () => {
      const existingId = 'existing-uuid-123';
      fs.mkdirSync(path.dirname(installationIdFile()), { recursive: true });
      fs.writeFileSync(installationIdFile(), existingId);

      const installationId = installationManager.getInstallationId();

      expect(installationId).toBe(existingId);
    });

    it('should return the same ID on subsequent calls', () => {
      const firstId = installationManager.getInstallationId();
      const secondId = installationManager.getInstallationId();
      expect(secondId).toBe(firstId);
    });

    it('should handle read errors and return a fallback ID', () => {
      // Mock readFileSync to throw an error
      const readSpy = vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('Read error');
      });
      // but existsSync should be true to attempt a read
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const id = installationManager.getInstallationId();

      expect(id).toBe('123456789');
      expect(consoleErrorSpy).toHaveBeenCalled();
      readSpy.mockRestore();
    });
  });
});
