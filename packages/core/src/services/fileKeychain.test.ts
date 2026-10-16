/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FileKeychain } from './fileKeychain.js';
import { GEMINI_DIR } from '../utils/paths.js';

const { mockHomedir } = vi.hoisted(() => ({ mockHomedir: vi.fn() }));

vi.mock('../utils/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths.js')>();
  return { ...actual, homedir: mockHomedir };
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, platform: vi.fn(actual.platform) };
});

describe('FileKeychain', () => {
  let testHome: string;
  let credentialsPath: string;

  const listGeminiDir = () => fs.readdir(path.join(testHome, GEMINI_DIR));

  beforeEach(async () => {
    testHome = await fs.mkdtemp(path.join(os.tmpdir(), 'file-keychain-test-'));
    mockHomedir.mockReturnValue(testHome);
    credentialsPath = path.join(
      testHome,
      GEMINI_DIR,
      'gemini-credentials.json',
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(testHome, { recursive: true, force: true });
  });

  describe('basic operations', () => {
    it('stores, reads, lists and deletes credentials', async () => {
      const keychain = new FileKeychain();

      await keychain.setPassword('svc', 'alice', 'secret-a');
      await keychain.setPassword('svc', 'bob', 'secret-b');

      expect(await keychain.getPassword('svc', 'alice')).toBe('secret-a');
      expect(await keychain.findCredentials('svc')).toEqual([
        { account: 'alice', password: 'secret-a' },
        { account: 'bob', password: 'secret-b' },
      ]);

      expect(await keychain.deletePassword('svc', 'alice')).toBe(true);
      expect(await keychain.deletePassword('svc', 'alice')).toBe(false);
      expect(await keychain.getPassword('svc', 'alice')).toBeNull();
      expect(await keychain.getPassword('svc', 'bob')).toBe('secret-b');
    });

    it('removes the credentials file when the last entry is deleted', async () => {
      const keychain = new FileKeychain();
      await keychain.setPassword('svc', 'alice', 'secret');

      expect(await keychain.deletePassword('svc', 'alice')).toBe(true);

      await expect(fs.access(credentialsPath)).rejects.toThrow();
      expect(await keychain.getPassword('svc', 'alice')).toBeNull();
    });

    it('stores the credentials encrypted', async () => {
      const keychain = new FileKeychain();
      await keychain.setPassword('svc', 'alice', 'plain-text-secret');

      const raw = await fs.readFile(credentialsPath, 'utf-8');
      expect(raw).not.toContain('plain-text-secret');
      expect(raw).not.toContain('alice');
    });

    it('leaves no temporary or lock files behind', async () => {
      const keychain = new FileKeychain();
      await keychain.setPassword('svc', 'alice', 'a');
      await keychain.setPassword('svc', 'bob', 'b');
      await keychain.deletePassword('svc', 'alice');

      expect(await listGeminiDir()).toEqual(['gemini-credentials.json']);
    });
  });

  describe('reserved key names', () => {
    const reservedNames = ['__proto__', 'constructor', 'prototype'];

    afterEach(() => {
      for (const name of ['polluted', ...reservedNames]) {
        expect(Object.prototype.hasOwnProperty.call({}, name)).toBe(false);
      }
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    });

    it.each(reservedNames)(
      'stores %s as an ordinary service name without touching Object.prototype',
      async (name) => {
        const keychain = new FileKeychain();

        await keychain.setPassword(name, 'polluted', 'secret');

        expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
        expect(await keychain.getPassword(name, 'polluted')).toBe('secret');
        expect(await keychain.findCredentials(name)).toEqual([
          { account: 'polluted', password: 'secret' },
        ]);
        expect(await keychain.deletePassword(name, 'polluted')).toBe(true);
        expect(await keychain.getPassword(name, 'polluted')).toBeNull();
      },
    );

    it.each(reservedNames)(
      'stores %s as an ordinary account name',
      async (name) => {
        const keychain = new FileKeychain();
        await keychain.setPassword('svc', 'other', 'x');

        await keychain.setPassword('svc', name, 'secret');

        expect(await keychain.getPassword('svc', name)).toBe('secret');
        expect(await keychain.findCredentials('svc')).toContainEqual({
          account: name,
          password: 'secret',
        });
        expect(await keychain.deletePassword('svc', name)).toBe(true);
        expect(await keychain.getPassword('svc', name)).toBeNull();
        expect(await keychain.getPassword('svc', 'other')).toBe('x');
      },
    );

    it('does not report missing entries for names inherited from Object.prototype', async () => {
      const keychain = new FileKeychain();
      await keychain.setPassword('svc', 'alice', 'a');

      expect(await keychain.getPassword('__proto__', 'alice')).toBeNull();
      expect(await keychain.getPassword('svc', 'toString')).toBeNull();
      expect(await keychain.findCredentials('__proto__')).toEqual([]);
      expect(await keychain.deletePassword('__proto__', 'alice')).toBe(false);
      expect(await keychain.deletePassword('svc', 'constructor')).toBe(false);
      expect(await keychain.getPassword('svc', 'alice')).toBe('a');
    });
  });

  describe('concurrent writers', () => {
    it('does not lose entries when several writers save at the same time', async () => {
      // Separate instances stand in for separate CLI processes.
      const writers = Array.from({ length: 8 }, () => new FileKeychain());

      await Promise.all(
        writers.map((keychain, i) =>
          keychain.setPassword('svc', `account-${i}`, `secret-${i}`),
        ),
      );

      const credentials = await new FileKeychain().findCredentials('svc');
      expect(credentials).toHaveLength(8);
      for (let i = 0; i < 8; i++) {
        expect(credentials).toContainEqual({
          account: `account-${i}`,
          password: `secret-${i}`,
        });
      }
    });

    it('does not resurrect or drop entries when writes and deletes interleave', async () => {
      const setup = new FileKeychain();
      for (let i = 0; i < 3; i++) {
        await setup.setPassword('svc', `old-${i}`, 'x');
      }

      await Promise.all([
        ...Array.from({ length: 3 }, (_, i) =>
          new FileKeychain().deletePassword('svc', `old-${i}`),
        ),
        ...Array.from({ length: 3 }, (_, i) =>
          new FileKeychain().setPassword('svc', `new-${i}`, 'y'),
        ),
      ]);

      const accounts = (await setup.findCredentials('svc'))
        .map((c) => c.account)
        .sort();
      expect(accounts).toEqual(['new-0', 'new-1', 'new-2']);
    });
  });

  describe('stale locks', () => {
    it('promptly takes over a lock left behind by a crashed process', async () => {
      const keychain = new FileKeychain();
      // proper-lockfile represents a held lock as a `<file>.lock` directory
      // whose mtime is refreshed while the holder is alive.
      const lockDir = `${credentialsPath}.lock`;
      await fs.mkdir(lockDir, { recursive: true });
      const crashedAt = new Date(Date.now() - 5_500);
      await fs.utimes(lockDir, crashedAt, crashedAt);

      const start = Date.now();
      await keychain.setPassword('svc', 'alice', 'a');

      expect(Date.now() - start).toBeLessThan(2_000);
      expect(await keychain.getPassword('svc', 'alice')).toBe('a');
      expect(await listGeminiDir()).toEqual(['gemini-credentials.json']);
    });
  });

  describe('atomic writes', () => {
    it('keeps the existing credentials intact when a write is interrupted', async () => {
      const keychain = new FileKeychain();
      await keychain.setPassword('svc', 'alice', 'secret-a');
      const before = await fs.readFile(credentialsPath, 'utf-8');

      // Simulate a crash / full disk partway through writing the new data.
      const realWriteFile = fs.writeFile;
      vi.spyOn(fs, 'writeFile').mockImplementationOnce(
        async (file, data, options) => {
          await realWriteFile(file, String(data).slice(0, 10), options);
          throw Object.assign(new Error('ENOSPC: no space left on device'), {
            code: 'ENOSPC',
          });
        },
      );

      await expect(
        keychain.setPassword('svc', 'bob', 'secret-b'),
      ).rejects.toThrow('ENOSPC');

      expect(await fs.readFile(credentialsPath, 'utf-8')).toBe(before);
      expect(await keychain.getPassword('svc', 'alice')).toBe('secret-a');
      expect(await keychain.getPassword('svc', 'bob')).toBeNull();
      expect(await listGeminiDir()).toEqual(['gemini-credentials.json']);
    });

    it('releases the lock after a failed write so later writes succeed', async () => {
      const keychain = new FileKeychain();
      vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(
        Object.assign(new Error('EIO: i/o error'), { code: 'EIO' }),
      );

      await expect(keychain.setPassword('svc', 'alice', 'a')).rejects.toThrow(
        'EIO',
      );
      await keychain.setPassword('svc', 'alice', 'a');

      expect(await keychain.getPassword('svc', 'alice')).toBe('a');
    });

    it('retries a rename that fails transiently (Windows EPERM/EBUSY)', async () => {
      const keychain = new FileKeychain();
      vi.spyOn(fs, 'rename')
        .mockRejectedValueOnce(
          Object.assign(new Error('EPERM'), { code: 'EPERM' }),
        )
        .mockRejectedValueOnce(
          Object.assign(new Error('EBUSY'), { code: 'EBUSY' }),
        );

      await keychain.setPassword('svc', 'alice', 'a');

      expect(fs.rename).toHaveBeenCalledTimes(3);
      expect(await keychain.getPassword('svc', 'alice')).toBe('a');
    });

    it('cleans up the temporary file when the rename fails permanently', async () => {
      const keychain = new FileKeychain();
      await keychain.setPassword('svc', 'alice', 'a');
      vi.spyOn(fs, 'rename').mockRejectedValue(
        Object.assign(new Error('EROFS'), { code: 'EROFS' }),
      );

      await expect(keychain.setPassword('svc', 'bob', 'b')).rejects.toThrow(
        'EROFS',
      );

      expect(fs.rename).toHaveBeenCalledTimes(1);
      expect(await listGeminiDir()).toEqual(['gemini-credentials.json']);
      expect(await keychain.getPassword('svc', 'alice')).toBe('a');
    });

    it('retries a rename that fails with EACCES on Windows', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      const keychain = new FileKeychain();
      vi.spyOn(fs, 'rename').mockRejectedValueOnce(
        Object.assign(new Error('EACCES'), { code: 'EACCES' }),
      );

      await keychain.setPassword('svc', 'alice', 'a');

      expect(fs.rename).toHaveBeenCalledTimes(2);
      expect(await keychain.getPassword('svc', 'alice')).toBe('a');
    });

    it('does not retry a rename that fails with EACCES on other platforms', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      const keychain = new FileKeychain();
      vi.spyOn(fs, 'rename').mockRejectedValue(
        Object.assign(new Error('EACCES'), { code: 'EACCES' }),
      );

      await expect(keychain.setPassword('svc', 'alice', 'a')).rejects.toThrow(
        'EACCES',
      );

      expect(fs.rename).toHaveBeenCalledTimes(1);
    });
  });
});
