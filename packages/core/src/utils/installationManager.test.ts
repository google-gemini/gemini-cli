/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {} from 'vitest';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InstallationManager } from './installationManager.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Storage } from '../config/storage.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    existsSync: vi.fn(actual.existsSync),
  } as typeof actual;
});

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

vi.mock('../config/storage', () => ({
  Storage: {
    getInstallationIdPath: vi.fn(),
  },
}));

describe('InstallationManager', () => {
  let installationManager: InstallationManager;
  const MOCK_DIR = path.join(os.tmpdir(), 'gemini');
  const getMockInstallationIdPath = () =>
    path.join(MOCK_DIR, 'installation_id');

  // const cleanMockDirectory = () => {
  //   try {
  //     if (fs.existsSync(MOCK_DIR)) {
  //       fs.rmSync(MOCK_DIR, { recursive: true, force: true });
  //     }
  //   } catch (error) {
  //     console.error('Error cleaning mock directory:', error);
  //   }
  // };

  beforeEach(() => {
    vi.mocked(Storage).getInstallationIdPath.mockReturnValue(
      getMockInstallationIdPath(),
    );
    installationManager = new InstallationManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getInstallationId', () => {
    it('should create and write a new installation ID if one does not exist', () => {
      const installationIdFile = getMockInstallationIdPath();
      const newId = 'new-uuid-123';

      // Mock randomUUID to return a predictable ID
      vi.mocked(randomUUID).mockReturnValue(
        newId as ReturnType<typeof randomUUID>,
      );

      // Mock fs.existsSync to return false, simulating the file not existing
      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Mock fs.writeFileSync to capture the arguments
      const writeFileSyncSpy = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(() => {});

      // Mock fs.mkdirSync to prevent actual directory creation
      const mkdirSyncSpy = vi
        .spyOn(fs, 'mkdirSync')
        .mockImplementation(() => undefined);

      const installationId = installationManager.getInstallationId();

      expect(installationId).toBe(newId);
      // Expect mkdirSync to have been called for the directory
      expect(mkdirSyncSpy).toHaveBeenCalledWith(
        path.dirname(installationIdFile),
        { recursive: true },
      );
      // Expect writeFileSync to have been called with the correct path and new ID
      expect(writeFileSyncSpy).toHaveBeenCalledWith(
        installationIdFile,
        newId,
        'utf-8',
      );
      // Expect existsSync to have been called
      expect(vi.mocked(fs.existsSync)).toHaveBeenCalledWith(installationIdFile);
    });

    it('should read an existing installation ID from a file', () => {
      const existingId = 'existing-uuid-123';
      const installationIdFile = getMockInstallationIdPath();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(` ${existingId} `);

      const installationId = installationManager.getInstallationId();

      expect(installationId).toBe(existingId);
      expect(vi.mocked(fs.existsSync)).toHaveBeenCalledWith(installationIdFile);
      expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledWith(
        installationIdFile,
        'utf-8',
      );
    });

    it('should return the same ID on subsequent calls', () => {
      const firstId = installationManager.getInstallationId();
      const secondId = installationManager.getInstallationId();
      expect(secondId).toBe(firstId);
    });

    it('should handle read errors and return a fallback ID', () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(true);
      const readSpy = vi.mocked(fs.readFileSync);
      readSpy.mockImplementationOnce(() => {
        throw new Error('Read error');
      });
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const id = installationManager.getInstallationId();

      expect(id).toBe('123456789');
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });
});
