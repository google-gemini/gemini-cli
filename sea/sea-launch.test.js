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
    lstatSync: vi.fn(),
    statSync: vi.fn(),
    openSync: vi.fn(),
    readSync: vi.fn(),
    closeSync: vi.fn(),
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
    lstatSync: vi.fn(),
    statSync: vi.fn(),
    openSync: vi.fn(),
    readSync: vi.fn(),
    closeSync: vi.fn(),
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
        openSync: vi.fn((p) => {
          if (p.endsWith('gemini.mjs')) return 10;
          if (p.endsWith('file.txt')) return 20;
          throw new Error('Not found');
        }),
        readSync: vi.fn((fd, buffer) => {
          let content = '';
          if (fd === 10) content = 'content1';
          if (fd === 20) content = 'content2';

          // Simulate simple read: write content to buffer and return length once, then return 0
          if (!buffer._readDone) {
            const buf = Buffer.from(content);
            buf.copy(buffer);
            buffer._readDone = true;
            return buf.length;
          } else {
            buffer._readDone = false; // Reset for next file
            return 0;
          }
        }),
        closeSync: vi.fn(),
      };

      const mockCrypto = {
        createHash: vi.fn(() => ({
          update: vi.fn(function (content) {
            this._content =
              (this._content || '') + Buffer.from(content).toString();
            return this;
          }),
          digest: vi.fn(function () {
            if (this._content === 'content1') return 'hash1';
            if (this._content === 'content2') return 'hash2';
            return 'wrong';
          }),
        })),
      };

      expect(verifyIntegrity(dir, manifest, mockFs, mockCrypto)).toBe(true);
    });

    it('returns false for mismatched hashes', () => {
      const dir = '/tmp/test';
      const manifest = { mainHash: 'hash1' };

      const mockFs = {
        openSync: vi.fn(() => 10),
        readSync: vi.fn((fd, buffer) => {
          if (!buffer._readDone) {
            const buf = Buffer.from('content_wrong');
            buf.copy(buffer);
            buffer._readDone = true;
            return buf.length;
          }
          return 0;
        }),
        closeSync: vi.fn(),
      };

      const mockCrypto = {
        createHash: vi.fn(() => ({
          update: vi.fn(function (content) {
            this._content =
              (this._content || '') + Buffer.from(content).toString();
            return this;
          }),
          digest: vi.fn(function () {
            return 'hash_wrong';
          }),
        })),
      };

      expect(verifyIntegrity(dir, manifest, mockFs, mockCrypto)).toBe(false);
    });

    it('returns false when fs throws error', () => {
      const dir = '/tmp/test';
      const manifest = { mainHash: 'hash1' };
      const mockFs = {
        openSync: vi.fn(() => {
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
    const S_IFDIR = 0o40000;
    const MODE_700 = 0o700;

    it('reuses existing runtime if secure and valid', () => {
      const deps = {
        fs: {
          existsSync: vi.fn(() => true),
          rmSync: vi.fn(),
          readFileSync: vi.fn(),
          openSync: vi.fn(() => 1),
          readSync: vi.fn((fd, buffer) => {
            if (!buffer._readDone) {
              buffer._readDone = true;
              return 1;
            }
            return 0;
          }),
          closeSync: vi.fn(),
          lstatSync: vi.fn(() => ({
            isDirectory: () => true,
            uid: 1000,
            mode: S_IFDIR | MODE_700,
          })),
        },
        os: {
          userInfo: () => ({ username: 'user' }),
          tmpdir: () => '/tmp',
        },
        path: path,
        processEnv: {},
        crypto: {
          createHash: vi.fn(() => {
            const hash = {
              update: vi.fn().mockReturnThis(),
              digest: vi.fn(() => 'h1'),
            };
            return hash;
          }),
        },
        processUid: 1000,
      };

      deps.fs.readFileSync.mockReturnValue('content');

      const runtime = prepareRuntime(mockManifest, mockGetAsset, deps);
      expect(runtime).toContain('gemini-runtime-1.0.0-user');
      expect(deps.fs.rmSync).not.toHaveBeenCalled();
    });

    it('recreates runtime if existing has wrong owner', () => {
      const deps = {
        fs: {
          existsSync: vi.fn().mockReturnValueOnce(true).mockReturnValue(false),
          rmSync: vi.fn(),
          mkdirSync: vi.fn(),
          writeFileSync: vi.fn(),
          renameSync: vi.fn(),
          readFileSync: vi.fn().mockReturnValue('content'),
          openSync: vi.fn(() => 1),
          readSync: vi.fn((fd, buffer) => {
            if (!buffer._readDone) {
              buffer._readDone = true;
              return 1;
            }
            return 0;
          }),
          closeSync: vi.fn(),
          lstatSync: vi.fn(() => ({
            isDirectory: () => true,
            uid: 999, // Wrong UID
            mode: S_IFDIR | MODE_700,
          })),
        },
        os: {
          userInfo: () => ({ username: 'user' }),
          tmpdir: () => '/tmp',
        },
        path: path,
        processEnv: {},
        crypto: {
          createHash: vi.fn(() => {
            const hash = {
              update: vi.fn().mockReturnThis(),
              digest: vi.fn(() => 'h1'),
            };
            return hash;
          }),
        },
        processUid: 1000,
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
    });

    it('recreates runtime if existing has wrong permissions', () => {
      const deps = {
        fs: {
          existsSync: vi.fn().mockReturnValueOnce(true).mockReturnValue(false),
          rmSync: vi.fn(),
          mkdirSync: vi.fn(),
          writeFileSync: vi.fn(),
          renameSync: vi.fn(),
          readFileSync: vi.fn().mockReturnValue('content'),
          openSync: vi.fn(() => 1),
          readSync: vi.fn((fd, buffer) => {
            if (!buffer._readDone) {
              buffer._readDone = true;
              return 1;
            }
            return 0;
          }),
          closeSync: vi.fn(),
          lstatSync: vi.fn(() => ({
            isDirectory: () => true,
            uid: 1000,
            mode: S_IFDIR | 0o777, // Too open
          })),
        },
        os: {
          userInfo: () => ({ username: 'user' }),
          tmpdir: () => '/tmp',
        },
        path: path,
        processEnv: {},
        crypto: {
          createHash: vi.fn(() => {
            const hash = {
              update: vi.fn().mockReturnThis(),
              digest: vi.fn(() => 'h1'),
            };
            return hash;
          }),
        },
        processUid: 1000,
        processPid: 123,
      };

      mockGetAsset.mockReturnValue(Buffer.from('asset_content'));

      prepareRuntime(mockManifest, mockGetAsset, deps);

      expect(deps.fs.rmSync).toHaveBeenCalledWith(
        expect.stringContaining('gemini-runtime'),
        expect.anything(),
      );
    });

    it('creates new runtime if existing is invalid (integrity check)', () => {
      const deps = {
        fs: {
          existsSync: vi.fn().mockReturnValueOnce(true).mockReturnValue(false),
          rmSync: vi.fn(),
          mkdirSync: vi.fn(),
          writeFileSync: vi.fn(),
          renameSync: vi.fn(),
          readFileSync: vi.fn().mockReturnValue('wrong_content'),
          openSync: vi.fn(() => 1),
          readSync: vi.fn((fd, buffer) => {
            if (!buffer._readDone) {
              buffer._readDone = true;
              return 1;
            }
            return 0;
          }),
          closeSync: vi.fn(),
          lstatSync: vi.fn(() => ({
            isDirectory: () => true,
            uid: 1000,
            mode: S_IFDIR | MODE_700,
          })),
        },
        os: {
          userInfo: () => ({ username: 'user' }),
          tmpdir: () => '/tmp',
        },
        path: path,
        processEnv: {},
        crypto: {
          createHash: vi.fn(() => {
            const hash = {
              update: vi.fn().mockReturnThis(),
              digest: vi.fn(() => 'hash_calculated'),
            };
            return hash;
          }),
        },
        processUid: 1000,
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
    });

    it('handles rename race condition: uses target if secure and valid', () => {
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
          openSync: vi.fn(() => 1),
          readSync: vi.fn((fd, buffer) => {
            if (!buffer._readDone) {
              buffer._readDone = true;
              return 1;
            }
            return 0;
          }),
          closeSync: vi.fn(),
          lstatSync: vi.fn(() => ({
            isDirectory: () => true,
            uid: 1000,
            mode: S_IFDIR | MODE_700,
          })),
        },
        os: {
          userInfo: () => ({ username: 'user' }),
          tmpdir: () => '/tmp',
        },
        path: path,
        processEnv: {},
        crypto: {
          createHash: vi.fn(() => {
            const hash = {
              update: vi.fn().mockReturnThis(),
              digest: vi.fn(() => 'h1'),
            };
            return hash;
          }),
        },
        processUid: 1000,
        processPid: 123,
      };

      // 1. Initial exists check -> false
      // 2. mkdir checks (destDir) -> false
      // 3. renameSync -> throws
      // 4. existsSync (race check) -> true
      deps.fs.existsSync
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValue(true);

      mockGetAsset.mockReturnValue(Buffer.from('asset_content'));

      const runtime = prepareRuntime(mockManifest, mockGetAsset, deps);

      expect(deps.fs.renameSync).toHaveBeenCalled();
      expect(runtime).toContain('gemini-runtime');
      expect(deps.fs.rmSync).toHaveBeenCalledWith(
        expect.stringContaining('gemini-setup'),
        expect.anything(),
      );
    });

    it('handles rename race condition: fails if target is insecure', () => {
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
          openSync: vi.fn(() => 1),
          readSync: vi.fn((fd, buffer) => {
            if (!buffer._readDone) {
              buffer._readDone = true;
              return 1;
            }
            return 0;
          }),
          closeSync: vi.fn(),
          lstatSync: vi.fn(() => ({
            isDirectory: () => true,
            uid: 999, // Wrong UID
            mode: S_IFDIR | MODE_700,
          })),
        },
        os: {
          userInfo: () => ({ username: 'user' }),
          tmpdir: () => '/tmp',
        },
        path: path,
        processEnv: {},
        crypto: {
          createHash: vi.fn(() => {
            const hash = {
              update: vi.fn().mockReturnThis(),
              digest: vi.fn(() => 'h1'),
            };
            return hash;
          }),
        },
        processUid: 1000,
        processPid: 123,
      };

      deps.fs.existsSync
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValue(true);

      mockGetAsset.mockReturnValue(Buffer.from('asset_content'));

      // Mock process.exit and console.error
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
      const consoleSpy = vi
        .spyOn(globalThis.console, 'error')
        .mockImplementation(() => {});

      prepareRuntime(mockManifest, mockGetAsset, deps);

      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it('uses LOCALAPPDATA on Windows if available', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      const deps = {
        fs: {
          existsSync: vi.fn().mockReturnValue(false),
          mkdirSync: vi.fn(),
          rmSync: vi.fn(),
          writeFileSync: vi.fn(),
          renameSync: vi.fn(),
          readFileSync: vi.fn().mockReturnValue('content'),
          openSync: vi.fn(() => 1),
          readSync: vi.fn((fd, buffer) => {
            if (!buffer._readDone) {
              buffer._readDone = true;
              return 1;
            }
            return 0;
          }),
          closeSync: vi.fn(),
          lstatSync: vi.fn(() => ({
            isDirectory: () => true,
            uid: 0,
            mode: S_IFDIR | MODE_700,
          })),
        },
        os: {
          userInfo: () => ({ username: 'user' }),
          tmpdir: () => 'C:\\Temp',
        },
        path: {
          join: (...args) => args.join('\\'),
          dirname: (p) => p.split('\\').slice(0, -1).join('\\'),
          resolve: (p) => p,
        },
        processEnv: {
          LOCALAPPDATA: 'C:\\Users\\User\\AppData\\Local',
        },
        crypto: {
          createHash: vi.fn(() => {
            const hash = {
              update: vi.fn().mockReturnThis(),
              digest: vi.fn(() => 'h1'),
            };
            return hash;
          }),
        },
        processUid: 'unknown',
      };

      prepareRuntime(mockManifest, mockGetAsset, deps);

      expect(deps.fs.mkdirSync).toHaveBeenCalledWith(
        'C:\\Users\\User\\AppData\\Local\\Google\\GeminiCLI',
        expect.objectContaining({ recursive: true }),
      );

      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });

    it('falls back to tmpdir on Windows if LOCALAPPDATA is missing', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      const deps = {
        fs: {
          existsSync: vi.fn().mockReturnValue(false),
          mkdirSync: vi.fn(),
          rmSync: vi.fn(),
          writeFileSync: vi.fn(),
          renameSync: vi.fn(),
          readFileSync: vi.fn().mockReturnValue('content'),
          openSync: vi.fn(() => 1),
          readSync: vi.fn((fd, buffer) => {
            if (!buffer._readDone) {
              buffer._readDone = true;
              return 1;
            }
            return 0;
          }),
          closeSync: vi.fn(),
          lstatSync: vi.fn(() => ({
            isDirectory: () => true,
            uid: 0,
            mode: S_IFDIR | MODE_700,
          })),
        },
        os: {
          userInfo: () => ({ username: 'user' }),
          tmpdir: () => 'C:\\Temp',
        },
        path: {
          join: (...args) => args.join('\\'),
          dirname: (p) => p.split('\\').slice(0, -1).join('\\'),
          resolve: (p) => p,
        },
        processEnv: {}, // Missing LOCALAPPDATA
        crypto: {
          createHash: vi.fn(() => {
            const hash = {
              update: vi.fn().mockReturnThis(),
              digest: vi.fn(() => 'h1'),
            };
            return hash;
          }),
        },
        processUid: 'unknown',
      };

      const runtime = prepareRuntime(mockManifest, mockGetAsset, deps);

      // Should use tmpdir
      expect(runtime).toContain('C:\\Temp');
      expect(runtime).not.toContain('Google\\GeminiCLI');

      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });

    it('falls back to tmpdir on Windows if mkdir fails', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      const deps = {
        fs: {
          existsSync: vi.fn().mockReturnValue(false),
          mkdirSync: vi.fn((p) => {
            if (typeof p === 'string' && p.includes('Google\\GeminiCLI')) {
              throw new Error('Permission denied');
            }
          }),
          rmSync: vi.fn(),
          writeFileSync: vi.fn(),
          renameSync: vi.fn(),
          readFileSync: vi.fn().mockReturnValue('content'),
          openSync: vi.fn(() => 1),
          readSync: vi.fn((fd, buffer) => {
            if (!buffer._readDone) {
              buffer._readDone = true;
              return 1;
            }
            return 0;
          }),
          closeSync: vi.fn(),
          lstatSync: vi.fn(() => ({
            isDirectory: () => true,
            uid: 0,
            mode: S_IFDIR | MODE_700,
          })),
        },
        os: {
          userInfo: () => ({ username: 'user' }),
          tmpdir: () => 'C:\\Temp',
        },
        path: {
          join: (...args) => args.join('\\'),
          dirname: (p) => p.split('\\').slice(0, -1).join('\\'),
          resolve: (p) => p,
        },
        processEnv: {
          LOCALAPPDATA: 'C:\\Users\\User\\AppData\\Local',
        },
        crypto: {
          createHash: vi.fn(() => {
            const hash = {
              update: vi.fn().mockReturnThis(),
              digest: vi.fn(() => 'h1'),
            };
            return hash;
          }),
        },
        processUid: 'unknown',
      };

      const runtime = prepareRuntime(mockManifest, mockGetAsset, deps);

      // Should use tmpdir
      expect(runtime).toContain('C:\\Temp');
      expect(deps.fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('Google\\GeminiCLI'),
        expect.anything(),
      );

      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });
  });
});
