/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import * as fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import EventEmitter from 'node:events';
import { Stream } from 'node:stream';

// Mock dependencies BEFORE imports
vi.mock('node:fs/promises');
vi.mock('node:fs', () => ({
  createWriteStream: vi.fn(),
}));
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
  };
});
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    spawnAsync: vi.fn(),
    debugLogger: {
      debug: vi.fn(),
      warn: vi.fn(),
    },
  };
});

import { spawnAsync } from '@google/gemini-cli-core';
import {
  clipboardHasImage,
  saveClipboardImage,
  cleanupOldClipboardImages,
  splitEscapedPaths,
  parsePastedPaths,
  resetDetectedLinuxClipboardTool,
} from './clipboardUtils.js';

describe('clipboardUtils', () => {
  let originalPlatform: string;

  beforeEach(() => {
    vi.resetAllMocks();
    originalPlatform = process.platform;
    resetDetectedLinuxClipboardTool();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    vi.restoreAllMocks();
  });

  const setPlatform = (platform: string) => {
    Object.defineProperty(process, 'platform', {
      value: platform,
    });
  };

  describe('clipboardHasImage (Linux)', () => {
    it('should return true when wl-paste shows image type', async () => {
      setPlatform('linux');
      (spawnAsync as Mock).mockResolvedValueOnce({
        stdout: 'image/png\ntext/plain',
      });

      const result = await clipboardHasImage();

      expect(result).toBe(true);
      expect(spawnAsync).toHaveBeenCalledWith('wl-paste', ['--list-types']);
    });

    it('should fall back to xclip if wl-paste fails and return true if xclip shows image', async () => {
      setPlatform('linux');
      (spawnAsync as Mock).mockRejectedValueOnce(new Error('wl-paste failed'));
      (spawnAsync as Mock).mockResolvedValueOnce({
        stdout: 'image/png\nTARGETS',
      });

      const result = await clipboardHasImage();

      expect(result).toBe(true);
      expect(spawnAsync).toHaveBeenCalledTimes(2);
      expect(spawnAsync).toHaveBeenNthCalledWith(1, 'wl-paste', [
        '--list-types',
      ]);
      expect(spawnAsync).toHaveBeenNthCalledWith(2, 'xclip', [
        '-selection',
        'clipboard',
        '-t',
        'TARGETS',
        '-o',
      ]);
    });

    it('should return false if both wl-paste and xclip fail', async () => {
      setPlatform('linux');
      (spawnAsync as Mock).mockRejectedValueOnce(new Error('wl-paste failed'));
      (spawnAsync as Mock).mockRejectedValueOnce(new Error('xclip failed'));

      const result = await clipboardHasImage();

      expect(result).toBe(false);
    });

    it('should return false if no image type is found', async () => {
      setPlatform('linux');
      (spawnAsync as Mock).mockResolvedValueOnce({ stdout: 'text/plain' });
      // If wl-paste works but has no image, it should verify with that and return false,
      // NOT fall back to xclip?
      // Looking at code:
      // if (stdout.includes('image/')) return true;
      // catch -> try xclip.
      // So if wl-paste succeeds but returns text/plain, it falls through to xclip?
      // Wait, let's check code logic:
      // try { spawn(wl-paste...); if(includes(image)) return true; } catch {}
      // try { spawn(xclip...); if(includes(image)) return true; } catch {}
      // return false;

      // So if wl-paste succeeds but NO image, it proceeds to try xclip.
      // This seems intentional (maybe wl-paste missed it?).
      // Let's mock xclip to also have no image.
      (spawnAsync as Mock).mockResolvedValueOnce({ stdout: 'text/plain' });

      const result = await clipboardHasImage();

      expect(result).toBe(false);
      expect(spawnAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe('saveClipboardImage (Linux)', () => {
    const mockTargetDir = '/tmp/target';
    const mockTempDir = '/tmp/target/.gemini-clipboard';

    beforeEach(() => {
      setPlatform('linux');
      (fs.mkdir as Mock).mockResolvedValue(undefined);
      (fs.unlink as Mock).mockResolvedValue(undefined);
    });

    const createMockChildProcess = (
      shouldSucceed: boolean,
      exitCode: number = 0,
    ) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: Stream & { pipe: Mock };
      };
      child.stdout = new Stream() as Stream & { pipe: Mock }; // Dummy stream
      child.stdout.pipe = vi.fn();

      // Simulate process execution
      setTimeout(() => {
        if (!shouldSucceed) {
          child.emit('error', new Error('Spawn failed'));
        } else {
          child.emit('close', exitCode);
        }
      }, 10);

      return child;
    };

    it('should save image using wl-paste if successful', async () => {
      // Mock fs.stat to return size > 0
      (fs.stat as Mock).mockResolvedValue({ size: 100, mtimeMs: Date.now() });

      // Mock spawn to return a successful process for wl-paste
      const mockChild = createMockChildProcess(true, 0);
      (spawn as Mock).mockReturnValueOnce(mockChild);

      // Mock createWriteStream
      const mockStream = new EventEmitter() as EventEmitter & {
        writableFinished: boolean;
      };
      mockStream.writableFinished = false;
      (createWriteStream as Mock).mockReturnValue(mockStream);

      const promise = saveClipboardImage(mockTargetDir);

      // Simulate stream finishing successfully BEFORE process closes
      mockStream.writableFinished = true;
      mockStream.emit('finish');

      const result = await promise;

      expect(result).toMatch(/clipboard-\d+\.png$/);
      expect(spawn).toHaveBeenCalledWith('wl-paste', expect.any(Array));
      expect(fs.mkdir).toHaveBeenCalledWith(mockTempDir, { recursive: true });
    });

    it('should fall back to xclip if wl-paste fails', async () => {
      // Mock fs.stat to return size > 0
      (fs.stat as Mock).mockResolvedValue({ size: 100, mtimeMs: Date.now() });

      // 1. wl-paste fails (non-zero exit code)
      const child1 = createMockChildProcess(true, 1);

      // 2. xclip succeeds
      const child2 = createMockChildProcess(true, 0);

      (spawn as Mock).mockReturnValueOnce(child1).mockReturnValueOnce(child2);

      const mockStream1 = new EventEmitter() as EventEmitter & {
        writableFinished: boolean;
      };
      const mockStream2 = new EventEmitter() as EventEmitter & {
        writableFinished: boolean;
      };
      (createWriteStream as Mock)
        .mockReturnValueOnce(mockStream1)
        .mockReturnValueOnce(mockStream2);

      const promise = saveClipboardImage(mockTargetDir);

      // Stream 1 finishes (but process fails)
      mockStream1.writableFinished = true;
      mockStream1.emit('finish');

      // Stream 2 finishes (and process succeeds)
      mockStream2.writableFinished = true;
      mockStream2.emit('finish');

      const result = await promise;

      expect(result).toMatch(/clipboard-\d+\.png$/);
      expect(spawn).toHaveBeenNthCalledWith(1, 'wl-paste', expect.any(Array));
      expect(spawn).toHaveBeenNthCalledWith(2, 'xclip', expect.any(Array));
    });

    it('should return null if both fail', async () => {
      // 1. wl-paste fails
      const child1 = createMockChildProcess(true, 1);
      // 2. xclip fails
      const child2 = createMockChildProcess(true, 1);

      (spawn as Mock).mockReturnValueOnce(child1).mockReturnValueOnce(child2);

      const mockStream1 = new EventEmitter() as EventEmitter & {
        writableFinished: boolean;
      };
      const mockStream2 = new EventEmitter() as EventEmitter & {
        writableFinished: boolean;
      };
      (createWriteStream as Mock)
        .mockReturnValueOnce(mockStream1)
        .mockReturnValueOnce(mockStream2);

      const promise = saveClipboardImage(mockTargetDir);

      mockStream1.writableFinished = true;
      mockStream1.emit('finish');
      mockStream2.writableFinished = true;
      mockStream2.emit('finish');

      const result = await promise;

      expect(result).toBe(null);
    });
  });

  describe('cleanupOldClipboardImages', () => {
    it('should not throw errors', async () => {
      // Should handle missing directories gracefully
      await expect(
        cleanupOldClipboardImages('/path/that/does/not/exist'),
      ).resolves.not.toThrow();
    });

    it('should complete without errors on valid directory', async () => {
      await expect(cleanupOldClipboardImages('.')).resolves.not.toThrow();
    });
  });

  describe('splitEscapedPaths', () => {
    it('should return single path when no spaces', () => {
      expect(splitEscapedPaths('/path/to/image.png')).toEqual([
        '/path/to/image.png',
      ]);
    });

    it('should split simple space-separated paths', () => {
      expect(splitEscapedPaths('/img1.png /img2.png')).toEqual([
        '/img1.png',
        '/img2.png',
      ]);
    });

    it('should split three paths', () => {
      expect(splitEscapedPaths('/a.png /b.jpg /c.heic')).toEqual([
        '/a.png',
        '/b.jpg',
        '/c.heic',
      ]);
    });

    it('should preserve escaped spaces within filenames', () => {
      expect(splitEscapedPaths('/my\\ image.png')).toEqual(['/my\\ image.png']);
    });

    it('should handle multiple paths with escaped spaces', () => {
      expect(splitEscapedPaths('/my\\ img1.png /my\\ img2.png')).toEqual([
        '/my\\ img1.png',
        '/my\\ img2.png',
      ]);
    });

    it('should handle path with multiple escaped spaces', () => {
      expect(splitEscapedPaths('/path/to/my\\ cool\\ image.png')).toEqual([
        '/path/to/my\\ cool\\ image.png',
      ]);
    });

    it('should handle multiple consecutive spaces between paths', () => {
      expect(splitEscapedPaths('/img1.png   /img2.png')).toEqual([
        '/img1.png',
        '/img2.png',
      ]);
    });

    it('should handle trailing and leading whitespace', () => {
      expect(splitEscapedPaths('  /img1.png /img2.png  ')).toEqual([
        '/img1.png',
        '/img2.png',
      ]);
    });

    it('should return empty array for empty string', () => {
      expect(splitEscapedPaths('')).toEqual([]);
    });

    it('should return empty array for whitespace only', () => {
      expect(splitEscapedPaths('   ')).toEqual([]);
    });
  });

  describe('parsePastedPaths', () => {
    it('should return null for empty string', () => {
      const result = parsePastedPaths('', () => true);
      expect(result).toBe(null);
    });

    it('should add @ prefix to single valid path', () => {
      const result = parsePastedPaths('/path/to/file.txt', () => true);
      expect(result).toBe('@/path/to/file.txt ');
    });

    it('should return null for single invalid path', () => {
      const result = parsePastedPaths('/path/to/file.txt', () => false);
      expect(result).toBe(null);
    });

    it('should add @ prefix to all valid paths', () => {
      // Use Set to model reality: individual paths exist, combined string doesn't
      const validPaths = new Set(['/path/to/file1.txt', '/path/to/file2.txt']);
      const result = parsePastedPaths(
        '/path/to/file1.txt /path/to/file2.txt',
        (p) => validPaths.has(p),
      );
      expect(result).toBe('@/path/to/file1.txt @/path/to/file2.txt ');
    });

    it('should only add @ prefix to valid paths', () => {
      const result = parsePastedPaths(
        '/valid/file.txt /invalid/file.jpg',
        (p) => p.endsWith('.txt'),
      );
      expect(result).toBe('@/valid/file.txt /invalid/file.jpg ');
    });

    it('should return null if no paths are valid', () => {
      const result = parsePastedPaths(
        '/path/to/file1.txt /path/to/file2.txt',
        () => false,
      );
      expect(result).toBe(null);
    });

    it('should handle paths with escaped spaces', () => {
      // Use Set to model reality: individual paths exist, combined string doesn't
      const validPaths = new Set(['/path/to/my file.txt', '/other/path.txt']);
      const result = parsePastedPaths(
        '/path/to/my\\ file.txt /other/path.txt',
        (p) => validPaths.has(p),
      );
      expect(result).toBe('@/path/to/my\\ file.txt @/other/path.txt ');
    });

    it('should unescape paths before validation', () => {
      // Use Set to model reality: individual paths exist, combined string doesn't
      const validPaths = new Set(['/my file.txt', '/other.txt']);
      const validatedPaths: string[] = [];
      parsePastedPaths('/my\\ file.txt /other.txt', (p) => {
        validatedPaths.push(p);
        return validPaths.has(p);
      });
      // First checks entire string, then individual unescaped segments
      expect(validatedPaths).toEqual([
        '/my\\ file.txt /other.txt',
        '/my file.txt',
        '/other.txt',
      ]);
    });

    it('should handle single path with unescaped spaces from copy-paste', () => {
      const result = parsePastedPaths('/path/to/my file.txt', () => true);
      expect(result).toBe('@/path/to/my\\ file.txt ');
    });

    it('should handle Windows path', () => {
      const result = parsePastedPaths('C:\\Users\\file.txt', () => true);
      expect(result).toBe('@C:\\Users\\file.txt ');
    });

    it('should handle Windows path with unescaped spaces', () => {
      const result = parsePastedPaths('C:\\My Documents\\file.txt', () => true);
      expect(result).toBe('@C:\\My\\ Documents\\file.txt ');
    });

    it('should handle multiple Windows paths', () => {
      const validPaths = new Set(['C:\\file1.txt', 'D:\\file2.txt']);
      const result = parsePastedPaths('C:\\file1.txt D:\\file2.txt', (p) =>
        validPaths.has(p),
      );
      expect(result).toBe('@C:\\file1.txt @D:\\file2.txt ');
    });

    it('should handle Windows UNC path', () => {
      const result = parsePastedPaths(
        '\\\\server\\share\\file.txt',
        () => true,
      );
      expect(result).toBe('@\\\\server\\share\\file.txt ');
    });
  });
});
