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
import {
  createWriteStream,
  existsSync,
  statSync,
  type Stats,
  type WriteStream,
} from 'node:fs';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import EventEmitter from 'node:events';
import { Stream } from 'node:stream';
import * as path from 'node:path';

// Mock dependencies BEFORE imports
vi.mock('node:fs/promises');
vi.mock('node:fs', () => ({
  createWriteStream: vi.fn(),
  existsSync: vi.fn(),
  statSync: vi.fn(),
}));
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
    execSync: vi.fn(),
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
    Storage: class {
      getProjectTempDir = vi.fn(() => '/tmp/global');
      initialize = vi.fn(() => Promise.resolve(undefined));
    },
  };
});

import { spawnAsync } from '@google/gemini-cli-core';
// Keep static imports for stateless functions
import {
  cleanupOldClipboardImages,
  splitDragAndDropPaths,
  parsePastedPaths,
} from './clipboardUtils.js';

const mockPlatform = (platform: string) => {
  vi.stubGlobal(
    'process',
    Object.create(process, {
      platform: {
        get: () => platform,
      },
    }),
  );
};

// Define the type for the module to use in tests
type ClipboardUtilsModule = typeof import('./clipboardUtils.js');

describe('clipboardUtils', () => {
  let originalEnv: NodeJS.ProcessEnv;
  // Dynamic module instance for stateful functions
  let clipboardUtils: ClipboardUtilsModule;

  const MOCK_FILE_STATS = {
    isFile: () => true,
    size: 100,
    mtimeMs: Date.now(),
  } as unknown as Stats;

  beforeEach(async () => {
    vi.resetAllMocks();
    originalEnv = process.env;
    process.env = { ...originalEnv };

    // Reset modules to clear internal state (linuxClipboardTool variable)
    vi.resetModules();
    // Dynamically import the module to get a fresh instance for each test
    clipboardUtils = await import('./clipboardUtils.js');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('clipboardHasImage (Linux)', () => {
    it('should return true when wl-paste shows image type (Wayland)', async () => {
      mockPlatform('linux');
      process.env['XDG_SESSION_TYPE'] = 'wayland';
      vi.mocked(execSync).mockReturnValue(Buffer.from('')); // command -v succeeds
      vi.mocked(spawnAsync).mockResolvedValueOnce({
        stdout: 'image/png\ntext/plain',
        stderr: '',
      });

      const result = await clipboardUtils.clipboardHasImage();

      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('wl-paste'),
        expect.anything(),
      );
      expect(spawnAsync).toHaveBeenCalledWith('wl-paste', ['--list-types']);
    });

    it('should return true when xclip shows image type (X11)', async () => {
      mockPlatform('linux');
      process.env['XDG_SESSION_TYPE'] = 'x11';
      vi.mocked(execSync).mockReturnValue(Buffer.from('')); // command -v succeeds
      vi.mocked(spawnAsync).mockResolvedValueOnce({
        stdout: 'image/png\nTARGETS',
        stderr: '',
      });

      const result = await clipboardUtils.clipboardHasImage();

      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('xclip'),
        expect.anything(),
      );
      expect(spawnAsync).toHaveBeenCalledWith('xclip', [
        '-selection',
        'clipboard',
        '-t',
        'TARGETS',
        '-o',
      ]);
    });

    it('should return false if tool fails', async () => {
      mockPlatform('linux');
      process.env['XDG_SESSION_TYPE'] = 'wayland';
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      vi.mocked(spawnAsync).mockRejectedValueOnce(new Error('wl-paste failed'));

      const result = await clipboardUtils.clipboardHasImage();

      expect(result).toBe(false);
    });

    it('should return false if no image type is found', async () => {
      mockPlatform('linux');
      process.env['XDG_SESSION_TYPE'] = 'wayland';
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      vi.mocked(spawnAsync).mockResolvedValueOnce({
        stdout: 'text/plain',
        stderr: '',
      });

      const result = await clipboardUtils.clipboardHasImage();

      expect(result).toBe(false);
    });

    it('should return false if tool not found', async () => {
      mockPlatform('linux');
      process.env['XDG_SESSION_TYPE'] = 'wayland';
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const result = await clipboardUtils.clipboardHasImage();

      expect(result).toBe(false);
    });
  });

  describe('saveClipboardImage (Linux)', () => {
    const mockTargetDir = '/tmp/target';
    const mockTempDir = path.join('/tmp/global', 'images');

    beforeEach(() => {
      mockPlatform('linux');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
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

    // Helper to prime the internal linuxClipboardTool state
    const primeClipboardTool = async (
      type: 'wayland' | 'x11',
      hasImage = true,
    ) => {
      process.env['XDG_SESSION_TYPE'] = type;
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      vi.mocked(spawnAsync).mockResolvedValueOnce({
        stdout: hasImage ? 'image/png' : 'text/plain',
        stderr: '',
      });
      await clipboardUtils.clipboardHasImage();
      vi.mocked(spawnAsync).mockClear();
      vi.mocked(execSync).mockClear();
    };

    it('should save image using wl-paste if detected', async () => {
      await primeClipboardTool('wayland');

      // Mock fs.stat to return size > 0
      vi.mocked(fs.stat).mockResolvedValue(MOCK_FILE_STATS);

      // Mock spawn to return a successful process for wl-paste
      const mockChild = createMockChildProcess(true, 0);
      vi.mocked(spawn).mockReturnValueOnce(
        mockChild as unknown as ChildProcess,
      );

      // Mock createWriteStream
      const mockStream = new EventEmitter() as EventEmitter & {
        writableFinished: boolean;
      };
      mockStream.writableFinished = false;
      vi.mocked(createWriteStream).mockReturnValue(
        mockStream as unknown as WriteStream,
      );

      // Use dynamic instance
      const promise = clipboardUtils.saveClipboardImage(mockTargetDir);

      // Simulate stream finishing successfully BEFORE process closes
      mockStream.writableFinished = true;
      mockStream.emit('finish');

      const result = await promise;

      expect(result).toContain(mockTempDir);
      expect(result).toMatch(/clipboard-\d+\.png$/);
      expect(spawn).toHaveBeenCalledWith('wl-paste', expect.any(Array));
      expect(fs.mkdir).toHaveBeenCalledWith(mockTempDir, { recursive: true });
    });

    it('should return null if wl-paste fails', async () => {
      await primeClipboardTool('wayland');

      // Mock fs.stat to return size > 0
      vi.mocked(fs.stat).mockResolvedValue(MOCK_FILE_STATS);

      // wl-paste fails (non-zero exit code)
      const child1 = createMockChildProcess(true, 1);
      vi.mocked(spawn).mockReturnValueOnce(child1 as unknown as ChildProcess);

      const mockStream1 = new EventEmitter() as EventEmitter & {
        writableFinished: boolean;
      };
      vi.mocked(createWriteStream).mockReturnValueOnce(
        mockStream1 as unknown as WriteStream,
      );

      const promise = clipboardUtils.saveClipboardImage(mockTargetDir);

      mockStream1.writableFinished = true;
      mockStream1.emit('finish');

      const result = await promise;

      expect(result).toBe(null);
      // Should NOT try xclip
      expect(spawn).toHaveBeenCalledTimes(1);
    });

    it('should save image using xclip if detected', async () => {
      await primeClipboardTool('x11');

      // Mock fs.stat to return size > 0
      vi.mocked(fs.stat).mockResolvedValue(MOCK_FILE_STATS);

      // Mock spawn to return a successful process for xclip
      const mockChild = createMockChildProcess(true, 0);
      vi.mocked(spawn).mockReturnValueOnce(
        mockChild as unknown as ChildProcess,
      );

      // Mock createWriteStream
      const mockStream = new EventEmitter() as EventEmitter & {
        writableFinished: boolean;
      };
      mockStream.writableFinished = false;
      vi.mocked(createWriteStream).mockReturnValue(
        mockStream as unknown as WriteStream,
      );

      const promise = clipboardUtils.saveClipboardImage(mockTargetDir);

      mockStream.writableFinished = true;
      mockStream.emit('finish');

      const result = await promise;

      expect(result).toMatch(/clipboard-\d+\.png$/);
      expect(spawn).toHaveBeenCalledWith('xclip', expect.any(Array));
    });

    it('should return null if tool is not yet detected', async () => {
      // Unset session type to ensure no tool is detected automatically
      delete process.env['XDG_SESSION_TYPE'];

      // Don't prime the tool
      const result = await clipboardUtils.saveClipboardImage(mockTargetDir);
      expect(result).toBe(null);
      expect(spawn).not.toHaveBeenCalled();
    });
  });

  // Stateless functions continue to use static imports
  describe('cleanupOldClipboardImages', () => {
    const mockTargetDir = '/tmp/target';
    it('should not throw errors', async () => {
      // Should handle missing directories gracefully
      await expect(
        cleanupOldClipboardImages(mockTargetDir),
      ).resolves.not.toThrow();
    });

    it('should complete without errors on valid directory', async () => {
      await expect(
        cleanupOldClipboardImages(mockTargetDir),
      ).resolves.not.toThrow();
    });
  });

  describe('splitDragAndDropPaths', () => {
    describe('in posix', () => {
      beforeEach(() => mockPlatform('linux'));

      it.each([
        ['empty string', '', []],
        ['single path no spaces', '/path/to/image.png', ['/path/to/image.png']],
        [
          'simple space-separated paths',
          '/img1.png /img2.png',
          ['/img1.png', '/img2.png'],
        ],
        [
          'three paths',
          '/a.png /b.jpg /c.heic',
          ['/a.png', '/b.jpg', '/c.heic'],
        ],
        ['escaped spaces', '/my\\ image.png', ['/my image.png']],
        [
          'multiple paths with escaped spaces',
          '/my\\ img1.png /my\\ img2.png',
          ['/my img1.png', '/my img2.png'],
        ],
        [
          'multiple escaped spaces',
          '/path/to/my\\ cool\\ image.png',
          ['/path/to/my cool image.png'],
        ],
        [
          'consecutive spaces',
          '/img1.png   /img2.png',
          ['/img1.png', '/img2.png'],
        ],
        [
          'trailing/leading whitespace',
          '  /img1.png /img2.png  ',
          ['/img1.png', '/img2.png'],
        ],
        ['whitespace only', '   ', []],
        ['quoted path with spaces', '"/my image.png"', ['/my image.png']],
        [
          'mixed quoted and unquoted',
          '"/my img1.png" /my\\ img2.png',
          ['/my img1.png', '/my img2.png'],
        ],
        [
          'quoted with escaped quotes',
          "'/derp/my '\\''cool'\\'' image.png'",
          ["/derp/my 'cool' image.png"],
        ],
      ])('should escape %s', (_, input, expected) => {
        expect([...splitDragAndDropPaths(input)]).toEqual(expected);
      });
    });

    describe('in windows', () => {
      beforeEach(() => mockPlatform('win32'));

      it.each([
        ['double quoted path', '"C:\\my image.png"', ['C:\\my image.png']],
        [
          'multiple double quoted paths',
          '"C:\\img 1.png" "D:\\img 2.png"',
          ['C:\\img 1.png', 'D:\\img 2.png'],
        ],
        ['unquoted path', 'C:\\img.png', ['C:\\img.png']],
        [
          'mixed quoted and unquoted',
          '"C:\\img 1.png" D:\\img2.png',
          ['C:\\img 1.png', 'D:\\img2.png'],
        ],
        ['single quoted path', "'C:\\my image.png'", ['C:\\my image.png']],
        [
          'mixed single and double quoted',
          '"C:\\img 1.png" \'D:\\img 2.png\'',
          ['C:\\img 1.png', 'D:\\img 2.png'],
        ],
      ])('should split %s', (_, input, expected) => {
        expect([...splitDragAndDropPaths(input)]).toEqual(expected);
      });
    });
  });

  describe('parsePastedPaths', () => {
    it('should return null for empty string', () => {
      const result = parsePastedPaths('');
      expect(result).toBe(null);
    });

    it('should add @ prefix to single valid path', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue(MOCK_FILE_STATS);
      const result = parsePastedPaths('/path/to/file.txt');
      expect(result).toBe('@/path/to/file.txt ');
    });

    it('should return null for single invalid path', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const result = parsePastedPaths('/path/to/file.txt');
      expect(result).toBe(null);
    });

    it('should add @ prefix to all valid paths', () => {
      const validPaths = new Set(['/path/to/file1.txt', '/path/to/file2.txt']);
      vi.mocked(existsSync).mockImplementation((p) =>
        validPaths.has(p as string),
      );
      vi.mocked(statSync).mockReturnValue(MOCK_FILE_STATS);

      const result = parsePastedPaths('/path/to/file1.txt /path/to/file2.txt');
      expect(result).toBe('@/path/to/file1.txt @/path/to/file2.txt ');
    });

    it('should return null if any path is invalid', () => {
      vi.mocked(existsSync).mockImplementation((p) =>
        (p as string).endsWith('.txt'),
      );
      vi.mocked(statSync).mockReturnValue(MOCK_FILE_STATS);

      const result = parsePastedPaths('/valid/file.txt /invalid/file.jpg');
      expect(result).toBe(null);
    });

    it('should return null if no paths are valid', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const result = parsePastedPaths('/path/to/file1.txt /path/to/file2.txt');
      expect(result).toBe(null);
    });

    describe('in posix', () => {
      beforeEach(() => {
        mockPlatform('linux');
      });

      it('should handle paths with escaped spaces', () => {
        const validPaths = new Set(['/path/to/my file.txt', '/other/path.txt']);
        vi.mocked(existsSync).mockImplementation((p) =>
          validPaths.has(p as string),
        );
        vi.mocked(statSync).mockReturnValue(MOCK_FILE_STATS);

        const result = parsePastedPaths(
          '/path/to/my\\ file.txt /other/path.txt',
        );
        expect(result).toBe('@/path/to/my\\ file.txt @/other/path.txt ');
      });

      it('should unescape paths before validation', () => {
        const validPaths = new Set(['/my file.txt', '/other.txt']);
        const validatedPaths: string[] = [];
        vi.mocked(existsSync).mockImplementation((p) => {
          validatedPaths.push(p as string);
          return validPaths.has(p as string);
        });
        vi.mocked(statSync).mockReturnValue(MOCK_FILE_STATS);

        parsePastedPaths('/my\\ file.txt /other.txt');
        // First checks entire string, then individual unescaped segments
        expect(validatedPaths).toEqual([
          '/my\\ file.txt /other.txt',
          '/my file.txt',
          '/other.txt',
        ]);
      });

      it('should handle single path with unescaped spaces from copy-paste', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(statSync).mockReturnValue(MOCK_FILE_STATS);

        const result = parsePastedPaths('/path/to/my file.txt');
        expect(result).toBe('@/path/to/my\\ file.txt ');
      });

      it('should handle single-quoted with escaped quote', () => {
        const validPaths = new Set([
          "/usr/test/my file with 'single quotes'.txt",
        ]);
        const validatedPaths: string[] = [];
        vi.mocked(existsSync).mockImplementation((p) => {
          validatedPaths.push(p as string);
          return validPaths.has(p as string);
        });
        vi.mocked(statSync).mockReturnValue(MOCK_FILE_STATS);

        const result = parsePastedPaths(
          "'/usr/test/my file with '\\''single quotes'\\''.txt'",
        );
        expect(result).toBe(
          "@/usr/test/my\\ file\\ with\\ \\'single\\ quotes\\'.txt ",
        );

        expect(validatedPaths).toEqual([
          "/usr/test/my file with 'single quotes'.txt",
        ]);
      });
    });

    describe('in windows', () => {
      beforeEach(() => mockPlatform('win32'));

      it('should handle Windows path', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(statSync).mockReturnValue(MOCK_FILE_STATS);

        const result = parsePastedPaths('C:\\Users\\file.txt');
        expect(result).toBe('@C:\\Users\\file.txt ');
      });

      it('should handle Windows path with unescaped spaces', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(statSync).mockReturnValue(MOCK_FILE_STATS);

        const result = parsePastedPaths('C:\\My Documents\\file.txt');
        expect(result).toBe('@"C:\\My Documents\\file.txt" ');
      });
      it('should handle multiple Windows paths', () => {
        const validPaths = new Set(['C:\\file1.txt', 'D:\\file2.txt']);
        vi.mocked(existsSync).mockImplementation((p) =>
          validPaths.has(p as string),
        );
        vi.mocked(statSync).mockReturnValue(MOCK_FILE_STATS);

        const result = parsePastedPaths('C:\\file1.txt D:\\file2.txt');
        expect(result).toBe('@C:\\file1.txt @D:\\file2.txt ');
      });

      it('should handle Windows UNC path', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(statSync).mockReturnValue(MOCK_FILE_STATS);

        const result = parsePastedPaths('\\\\server\\share\\file.txt');
        expect(result).toBe('@\\\\server\\share\\file.txt ');
      });
    });
  });
});
