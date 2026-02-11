/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import * as path from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import {
  sanitizeArgv,
  getSafeName,
  verifyIntegrity,
  prepareRuntime,
  main,
} from './sea-launch.cjs';

// Mocking fs and os
// We need to use vi.mock factory for ESM mocking of built-in modules in Vitest
vi.mock('node:fs', async () => {
  const fsMock = {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    renameSync: vi.fn(),
    rmSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('content'),
  };
  return {
    default: fsMock,
    ...fsMock,
  };
});
vi.mock('fs', async () => {
  const fsMock = {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    renameSync: vi.fn(),
    rmSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('content'),
  };
  return {
    default: fsMock,
    ...fsMock,
  };
});

vi.mock('node:os', async () => {
  const osMock = {
    userInfo: () => ({ username: 'user' }),
    tmpdir: () => '/tmp',
  };
  return {
    default: osMock,
    ...osMock,
  };
});
vi.mock('os', async () => {
  const osMock = {
    userInfo: () => ({ username: 'user' }),
    tmpdir: () => '/tmp',
  };
  return {
    default: osMock,
    ...osMock,
  };
});

describe('sea-launch', () => {
  describe('main', () => {
    it('executes main logic', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
      const consoleSpy = vi
        .spyOn(globalThis.console, 'error')
        .mockImplementation(() => {});

      const mockGetAsset = vi.fn((key) => {
        if (key === 'manifest.json')
          return JSON.stringify({ version: '1.0.0', mainHash: 'h1' });
        return Buffer.from('content');
      });

      await main(mockGetAsset);

      expect(consoleSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalled();

      exitSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  describe('sanitizeArgv', () => {
    it('removes ghost argument when argv[2] matches execPath', () => {
      const execPath = '/bin/node';
      const argv = ['/bin/node', '/app/script.js', '/bin/node', 'arg1'];
      const resolveFn = (p) => p;
      const removed = sanitizeArgv(argv, execPath, resolveFn);
      expect(removed).toBe(true);
      expect(argv).toEqual(['/bin/node', '/app/script.js', 'arg1']);
    });

    it('does nothing if argv[2] does not match execPath', () => {
      const execPath = '/bin/node';
      const argv = ['/bin/node', '/app/script.js', 'command', 'arg1'];
      const resolveFn = (p) => p;
      const removed = sanitizeArgv(argv, execPath, resolveFn);
      expect(removed).toBe(false);
      expect(argv).toHaveLength(4);
    });

    it('handles resolving relative paths', () => {
      const execPath = '/bin/node';
      const argv = ['/bin/node', '/app/script.js', './node', 'arg1'];
      const resolveFn = (p) => (p === './node' ? '/bin/node' : p);
      const removed = sanitizeArgv(argv, execPath, resolveFn);
      expect(removed).toBe(true);
    });
  });

  describe('getSafeName', () => {
    it('sanitizes strings', () => {
      expect(getSafeName('user@name')).toBe('user_name');
      expect(getSafeName('../path')).toBe('.._path');
      expect(getSafeName('valid-1.2')).toBe('valid-1.2');
      expect(getSafeName(undefined)).toBe('unknown');
    });
  });

  describe('verifyIntegrity', () => {
    it('returns true for matching hashes', () => {
      const dir = '/tmp/test';
      const manifest = {
        mainHash: 'hash1',
        files: [{ path: 'file.txt', hash: 'hash2' }],
      };

      const mockFs = {
        readFileSync: vi.fn((p) => {
          if (p.endsWith('gemini.mjs')) return 'content1';
          if (p.endsWith('file.txt')) return 'content2';
          throw new Error('Not found');
        }),
      };

      const mockCrypto = {
        createHash: vi.fn(() => ({
          update: vi.fn((content) => ({
            digest: vi.fn(() => {
              if (content === 'content1') return 'hash1';
              if (content === 'content2') return 'hash2';
              return 'wrong';
            }),
          })),
        })),
      };

      expect(verifyIntegrity(dir, manifest, mockFs, mockCrypto)).toBe(true);
    });

    it('returns false for mismatched hashes', () => {
      const dir = '/tmp/test';
      const manifest = { mainHash: 'hash1' };

      const mockFs = {
        readFileSync: vi.fn(() => 'content_wrong'),
      };

      const mockCrypto = {
        createHash: vi.fn(() => ({
          update: vi.fn(() => ({
            digest: vi.fn(() => 'hash_wrong'),
          })),
        })),
      };

      expect(verifyIntegrity(dir, manifest, mockFs, mockCrypto)).toBe(false);
    });

    it('returns false when fs throws error', () => {
      const dir = '/tmp/test';
      const manifest = { mainHash: 'hash1' };
      const mockFs = {
        readFileSync: vi.fn(() => {
          throw new Error('FS Error');
        }),
      };
      const mockCrypto = { createHash: vi.fn() };
      expect(verifyIntegrity(dir, manifest, mockFs, mockCrypto)).toBe(false);
    });
  });

  describe('prepareRuntime', () => {
    const mockManifest = {
      version: '1.0.0',
      mainHash: 'h1',
      files: [{ key: 'f1', path: 'p1', hash: 'h1' }],
    };
    const mockGetAsset = vi.fn();

    it('reuses existing runtime if valid', () => {
      const deps = {
        fs: {
          existsSync: vi.fn(() => true),
          rmSync: vi.fn(),
          readFileSync: vi.fn(),
        },
        os: {
          userInfo: () => ({ username: 'user' }),
          tmpdir: () => '/tmp',
        },
        path: path,
        processEnv: {},
        crypto: {
          createHash: vi.fn(() => ({
            update: vi.fn(() => ({ digest: vi.fn(() => 'h1') })),
          })),
        },
      };

      deps.fs.readFileSync.mockReturnValue('content');

      const runtime = prepareRuntime(mockManifest, mockGetAsset, deps);
      expect(runtime).toContain('gemini-runtime-1.0.0-user');
      expect(deps.fs.rmSync).not.toHaveBeenCalled();
    });

    it('creates new runtime if existing is invalid', () => {
      const deps = {
        fs: {
          existsSync: vi.fn().mockReturnValueOnce(true).mockReturnValue(false),
          rmSync: vi.fn(),
          mkdirSync: vi.fn(),
          writeFileSync: vi.fn(),
          renameSync: vi.fn(),
          readFileSync: vi.fn().mockReturnValue('wrong_content'),
        },
        os: {
          userInfo: () => ({ username: 'user' }),
          tmpdir: () => '/tmp',
        },
        path: path,
        processEnv: {},
        crypto: {
          createHash: vi.fn(() => ({
            update: vi.fn(() => ({ digest: vi.fn(() => 'hash_calculated') })),
          })),
        },
        processPid: 123,
      };

      mockGetAsset.mockReturnValue(Buffer.from('asset_content'));

      prepareRuntime(mockManifest, mockGetAsset, deps);

      expect(deps.fs.rmSync).toHaveBeenCalledWith(
        expect.stringContaining('gemini-runtime'),
        expect.anything(),
      );
      expect(deps.fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('gemini-setup'),
        expect.anything(),
      );
      expect(deps.fs.writeFileSync).toHaveBeenCalled();
      expect(deps.fs.renameSync).toHaveBeenCalled();
    });

    it('handles rename failure and falls back to existing if valid', () => {
      const deps = {
        fs: {
          existsSync: vi.fn(),
          rmSync: vi.fn(),
          mkdirSync: vi.fn(),
          writeFileSync: vi.fn(),
          renameSync: vi.fn(() => {
            throw new Error('Rename failed');
          }),
          readFileSync: vi.fn().mockReturnValue('content'),
        },
        os: {
          userInfo: () => ({ username: 'user' }),
          tmpdir: () => '/tmp',
        },
        path: path,
        processEnv: {},
        crypto: {
          createHash: vi.fn(() => ({
            update: vi.fn(() => ({ digest: vi.fn(() => 'h1') })),
          })),
        },
        processPid: 123,
      };

      deps.fs.existsSync
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValue(true);

      mockGetAsset.mockReturnValue(Buffer.from('asset_content'));

      const simpleManifest = { version: '1.0.0', mainHash: 'h1' };

      const runtime = prepareRuntime(simpleManifest, mockGetAsset, deps);

      expect(deps.fs.renameSync).toHaveBeenCalled();
      expect(runtime).toContain('gemini-runtime');
      expect(deps.fs.rmSync).toHaveBeenCalledWith(
        expect.stringContaining('gemini-setup'),
        expect.anything(),
      );
    });
  });
});
