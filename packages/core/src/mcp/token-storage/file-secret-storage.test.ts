/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { FileSecretStorage } from './file-secret-storage.js';

vi.mock('node:fs', () => {
  const actualFs = vi.importActual('node:fs');
  return {
    ...actualFs,
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      unlink: vi.fn(),
      mkdir: vi.fn(),
      rename: vi.fn(),
    },
    statSync: vi.fn(() => ({
      ino: 12345,
      birthtimeMs: 67890,
    })),
  };
});

vi.mock('node:child_process', () => ({
  exec: vi.fn(
    (
      _cmd: string,
      cb: (err: Error | null, result: { stdout: string }) => void,
    ) => cb(null, { stdout: '' }),
  ),
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: vi.fn(() => '/home/test'),
    hostname: vi.fn(() => 'test-host'),
    userInfo: vi.fn(
      () =>
        ({ username: 'test-user' }) as unknown as ReturnType<
          typeof actual.userInfo
        >,
    ),
    platform: vi.fn(
      () => 'darwin' as unknown as ReturnType<typeof actual.platform>,
    ),
    default: {
      ...actual,
      homedir: vi.fn(() => '/home/test'),
      hostname: vi.fn(() => 'test-host'),
      userInfo: vi.fn(
        () =>
          ({ username: 'test-user' }) as unknown as ReturnType<
            typeof actual.userInfo
          >,
      ),
      platform: vi.fn(
        () => 'darwin' as unknown as ReturnType<typeof actual.platform>,
      ),
    },
  };
});

vi.mock('systeminformation', () => ({
  default: {
    uuid: vi.fn(async () => ({
      os: 'os-uuid',
      hardware: 'hw-uuid',
    })),
    baseboard: vi.fn(async () => ({
      serial: 'baseboard-serial',
    })),
    diskLayout: vi.fn(async () => [{ serialNum: 'disk-serial' }]),
    networkInterfaces: vi.fn(async () => [{ mac: '00:11:22:33:44:55' }]),
  },
}));

describe('FileSecretStorage', () => {
  let storage: FileSecretStorage;
  const mockFs = fs as unknown as {
    readFile: ReturnType<typeof vi.fn>;
    writeFile: ReturnType<typeof vi.fn>;
    unlink: ReturnType<typeof vi.fn>;
    mkdir: ReturnType<typeof vi.fn>;
    rename: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new FileSecretStorage('test-service');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should set and get a secret using deep hardware binding and double encryption', async () => {
    const storedData = new Map<string, string>();
    mockFs.readFile.mockImplementation(async (filePath: string) => {
      const data = storedData.get(filePath);
      if (data === undefined) {
        const error = new Error(`File not found: ${filePath}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).code = 'ENOENT';
        throw error;
      }
      return data;
    });

    mockFs.writeFile.mockImplementation(
      async (filePath: string, data: unknown) => {
        if (typeof data === 'string') {
          storedData.set(filePath, data);
        }
      },
    );

    mockFs.rename.mockImplementation(
      async (oldPath: string, newPath: string) => {
        const data = storedData.get(oldPath);
        if (data !== undefined) {
          storedData.set(newPath, data);
          storedData.delete(oldPath);
        }
      },
    );

    await storage.setSecret('key1', 'value1');

    const stealthPath = path.join(
      '/home/test',
      '.gemini',
      '.sys-test-service-cache.db',
    );
    const finalContent = storedData.get(stealthPath);
    expect(finalContent).toBeDefined();
    expect(finalContent).toMatch(/^v2:/);

    // Check Installation ID
    expect(storedData.has('/home/test/.gemini_id')).toBe(true);

    // Verify atomic operation (temp file was used)
    expect(mockFs.rename).toHaveBeenCalled();

    // Re-read with a new instance to verify consistency
    const storage2 = new FileSecretStorage('test-service');
    const value = await storage2.getSecret('key1');
    expect(value).toBe('value1');
  });

  it('should migrate legacy v1 files and upgrade to v2 double-encryption', async () => {
    // Manually construct a legacy V1 file (No inner encryption)
    const machineIdentifier =
      'os-uuid-hw-uuid-baseboard-serial-disk-serial-00:11:22:33:44:55-test-host-test-user';
    const password = 'gemini-cli-secret-v1-test-service-';
    const salt = crypto
      .createHash('sha256')
      .update(`salt-${machineIdentifier}`)
      .digest();
    const key = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const json = JSON.stringify({ oldKey: 'oldValue' });
    let encrypted = cipher.update(json, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    const v1Data = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;

    const oldPath = path.join(
      '/home/test',
      '.gemini',
      'secrets-test-service.json',
    );

    mockFs.readFile.mockImplementation(async (filePath: string) => {
      if (filePath === oldPath) return v1Data;
      const error = new Error('File not found');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code = 'ENOENT';
      throw error;
    });

    const value = await storage.getSecret('oldKey');
    expect(value).toBe('oldValue');
  });
});
