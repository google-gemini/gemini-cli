/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import * as os from 'os';
import { detect as chardetDetect } from 'chardet';

// Mock dependencies
vi.mock('child_process');
vi.mock('os');
vi.mock('chardet');

// Import the functions we want to test after refactoring
import {
  getCachedEncodingForBuffer,
  getSystemEncoding,
  windowsCodePageToEncoding,
  detectEncodingFromBuffer,
  resetEncodingCache,
} from './systemEncoding.js';

describe('Shell Command Processor - Encoding Functions', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let mockedExecSync: ReturnType<typeof vi.mocked<typeof execSync>>;
  let mockedOsPlatform: ReturnType<typeof vi.mocked<() => string>>;
  let mockedChardetDetect: ReturnType<typeof vi.mocked<typeof chardetDetect>>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockedExecSync = vi.mocked(execSync);
    mockedOsPlatform = vi.mocked(os.platform);
    mockedChardetDetect = vi.mocked(chardetDetect);

    // Reset the encoding cache before each test
    resetEncodingCache();

    // Clear environment variables that might affect tests
    delete process.env['LC_ALL'];
    delete process.env['LC_CTYPE'];
    delete process.env['LANG'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetEncodingCache();
  });

  describe('windowsCodePageToEncoding', () => {
    it('should map common Windows code pages correctly', () => {
      expect(windowsCodePageToEncoding(437)).toBe('cp437');
      expect(windowsCodePageToEncoding(850)).toBe('cp850');
      expect(windowsCodePageToEncoding(65001)).toBe('utf-8');
      expect(windowsCodePageToEncoding(1252)).toBe('windows-1252');
      expect(windowsCodePageToEncoding(932)).toBe('shift_jis');
      expect(windowsCodePageToEncoding(936)).toBe('gb2312');
      expect(windowsCodePageToEncoding(949)).toBe('euc-kr');
      expect(windowsCodePageToEncoding(950)).toBe('big5');
      expect(windowsCodePageToEncoding(1200)).toBe('utf-16le');
      expect(windowsCodePageToEncoding(1201)).toBe('utf-16be');
    });

    it('should return null for unmapped code pages and warn', () => {
      expect(windowsCodePageToEncoding(99999)).toBe(null);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Unable to determine encoding for windows code page 99999.',
      );
    });

    it('should handle all Windows-specific code pages', () => {
      expect(windowsCodePageToEncoding(874)).toBe('windows-874');
      expect(windowsCodePageToEncoding(1250)).toBe('windows-1250');
      expect(windowsCodePageToEncoding(1251)).toBe('windows-1251');
      expect(windowsCodePageToEncoding(1253)).toBe('windows-1253');
      expect(windowsCodePageToEncoding(1254)).toBe('windows-1254');
      expect(windowsCodePageToEncoding(1255)).toBe('windows-1255');
      expect(windowsCodePageToEncoding(1256)).toBe('windows-1256');
      expect(windowsCodePageToEncoding(1257)).toBe('windows-1257');
      expect(windowsCodePageToEncoding(1258)).toBe('windows-1258');
    });
  });

  describe('detectEncodingFromBuffer', () => {
    it('should detect encoding using chardet successfully', () => {
      const buffer = Buffer.from('test content', 'utf8');
      mockedChardetDetect.mockReturnValue('UTF-8');

      const result = detectEncodingFromBuffer(buffer);
      expect(result).toBe('utf-8');
      expect(mockedChardetDetect).toHaveBeenCalledWith(buffer);
    });

    it('should handle chardet returning mixed case encoding', () => {
      const buffer = Buffer.from('test content', 'utf8');
      mockedChardetDetect.mockReturnValue('ISO-8859-1');

      const result = detectEncodingFromBuffer(buffer);
      expect(result).toBe('iso-8859-1');
    });

    it('should return null when chardet fails', () => {
      const buffer = Buffer.from('test content', 'utf8');
      mockedChardetDetect.mockImplementation(() => {
        throw new Error('Detection failed');
      });

      const result = detectEncodingFromBuffer(buffer);
      expect(result).toBe(null);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to detect encoding with chardet:',
        expect.any(Error),
      );
    });

    it('should return null when chardet returns null', () => {
      const buffer = Buffer.from('test content', 'utf8');
      mockedChardetDetect.mockReturnValue(null);

      const result = detectEncodingFromBuffer(buffer);
      expect(result).toBe(null);
    });

    it('should return null when chardet returns non-string', () => {
      const buffer = Buffer.from('test content', 'utf8');
      mockedChardetDetect.mockReturnValue([
        'utf-8',
        'iso-8859-1',
      ] as unknown as string);

      const result = detectEncodingFromBuffer(buffer);
      expect(result).toBe(null);
    });
  });

  describe('getSystemEncoding - Windows', () => {
    beforeEach(() => {
      mockedOsPlatform.mockReturnValue('win32');
    });

    it('should parse Windows chcp output correctly', () => {
      mockedExecSync.mockReturnValue('Active code page: 65001');

      const result = getSystemEncoding();
      expect(result).toBe('utf-8');
      expect(mockedExecSync).toHaveBeenCalledWith('chcp', { encoding: 'utf8' });
    });

    it('should handle different chcp output formats', () => {
      mockedExecSync.mockReturnValue('Current code page: 1252');

      const result = getSystemEncoding();
      expect(result).toBe('windows-1252');
    });

    it('should handle chcp output with extra whitespace', () => {
      mockedExecSync.mockReturnValue('Active code page:   437   ');

      const result = getSystemEncoding();
      expect(result).toBe('cp437');
    });

    it('should return null when chcp command fails', () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('Command failed');
      });

      const result = getSystemEncoding();
      expect(result).toBe(null);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Failed to get Windows code page using 'chcp' command",
        ),
      );
    });

    it('should return null when chcp output cannot be parsed', () => {
      mockedExecSync.mockReturnValue('Unexpected output format');

      const result = getSystemEncoding();
      expect(result).toBe(null);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Failed to get Windows code page using 'chcp' command",
        ),
      );
    });

    it('should return null when code page is not a number', () => {
      mockedExecSync.mockReturnValue('Active code page: abc');

      const result = getSystemEncoding();
      expect(result).toBe(null);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Failed to get Windows code page using 'chcp' command",
        ),
      );
    });

    it('should return null when code page maps to null', () => {
      mockedExecSync.mockReturnValue('Active code page: 99999');

      const result = getSystemEncoding();
      expect(result).toBe(null);
      // Should warn about unknown code page from windowsCodePageToEncoding
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Unable to determine encoding for windows code page 99999.',
      );
    });
  });

  describe('getSystemEncoding - Unix-like', () => {
    beforeEach(() => {
      mockedOsPlatform.mockReturnValue('linux');
    });

    it('should parse locale from LC_ALL environment variable', () => {
      process.env['LC_ALL'] = 'en_US.UTF-8';

      const result = getSystemEncoding();
      expect(result).toBe('utf-8');
    });

    it('should parse locale from LC_CTYPE when LC_ALL is not set', () => {
      process.env['LC_CTYPE'] = 'fr_FR.ISO-8859-1';

      const result = getSystemEncoding();
      expect(result).toBe('iso-8859-1');
    });

    it('should parse locale from LANG when LC_ALL and LC_CTYPE are not set', () => {
      process.env['LANG'] = 'de_DE.UTF-8';

      const result = getSystemEncoding();
      expect(result).toBe('utf-8');
    });

    it('should handle locale charmap command when environment variables are empty', () => {
      mockedExecSync.mockReturnValue('UTF-8\n');

      const result = getSystemEncoding();
      expect(result).toBe('utf-8');
      expect(mockedExecSync).toHaveBeenCalledWith('locale charmap', {
        encoding: 'utf8',
      });
    });

    it('should handle locale charmap with mixed case', () => {
      mockedExecSync.mockReturnValue('ISO-8859-1\n');

      const result = getSystemEncoding();
      expect(result).toBe('iso-8859-1');
    });

    it('should return null when locale charmap fails', () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('Command failed');
      });

      const result = getSystemEncoding();
      expect(result).toBe(null);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to get locale charmap.',
      );
    });

    it('should handle locale without encoding (no dot)', () => {
      process.env['LANG'] = 'C';

      const result = getSystemEncoding();
      expect(result).toBe('c');
    });

    it('should handle empty locale environment variables', () => {
      process.env['LC_ALL'] = '';
      process.env['LC_CTYPE'] = '';
      process.env['LANG'] = '';
      mockedExecSync.mockReturnValue('UTF-8');

      const result = getSystemEncoding();
      expect(result).toBe('utf-8');
    });

    it('should return locale as-is when locale format has no dot', () => {
      process.env['LANG'] = 'invalid_format';

      const result = getSystemEncoding();
      expect(result).toBe('invalid_format');
    });

    it('should prioritize LC_ALL over other environment variables', () => {
      process.env['LC_ALL'] = 'en_US.UTF-8';
      process.env['LC_CTYPE'] = 'fr_FR.ISO-8859-1';
      process.env['LANG'] = 'de_DE.CP1252';

      const result = getSystemEncoding();
      expect(result).toBe('utf-8');
    });

    it('should prioritize LC_CTYPE over LANG', () => {
      process.env['LC_CTYPE'] = 'fr_FR.ISO-8859-1';
      process.env['LANG'] = 'de_DE.CP1252';

      const result = getSystemEncoding();
      expect(result).toBe('iso-8859-1');
    });
  });

  describe('getEncodingForBuffer', () => {
    beforeEach(() => {
      mockedOsPlatform.mockReturnValue('linux');
    });

    it('should use cached system encoding on subsequent calls', () => {
      process.env['LANG'] = 'en_US.UTF-8';
      const buffer = Buffer.from('test');

      // First call
      const result1 = getCachedEncodingForBuffer(buffer);
      expect(result1).toBe('utf-8');

      // Change environment (should not affect cached result)
      process.env['LANG'] = 'fr_FR.ISO-8859-1';

      // Second call should use cached value
      const result2 = getCachedEncodingForBuffer(buffer);
      expect(result2).toBe('utf-8');
    });

    it('should fall back to buffer detection when system encoding fails', () => {
      // No environment variables set
      mockedExecSync.mockImplementation(() => {
        throw new Error('locale command failed');
      });

      const buffer = Buffer.from('test');
      mockedChardetDetect.mockReturnValue('ISO-8859-1');

      const result = getCachedEncodingForBuffer(buffer);
      expect(result).toBe('iso-8859-1');
      expect(mockedChardetDetect).toHaveBeenCalledWith(buffer);
    });

    it('should fall back to utf-8 when both system and buffer detection fail', () => {
      // System encoding fails
      mockedExecSync.mockImplementation(() => {
        throw new Error('locale command failed');
      });

      // Buffer detection fails
      mockedChardetDetect.mockImplementation(() => {
        throw new Error('chardet failed');
      });

      const buffer = Buffer.from('test');
      const result = getCachedEncodingForBuffer(buffer);
      expect(result).toBe('utf-8');
    });

    it('should not cache buffer detection results', () => {
      // System encoding fails initially
      mockedExecSync.mockImplementation(() => {
        throw new Error('locale command failed');
      });

      const buffer1 = Buffer.from('test1');
      const buffer2 = Buffer.from('test2');

      mockedChardetDetect
        .mockReturnValueOnce('ISO-8859-1')
        .mockReturnValueOnce('UTF-16');

      const result1 = getCachedEncodingForBuffer(buffer1);
      const result2 = getCachedEncodingForBuffer(buffer2);

      expect(result1).toBe('iso-8859-1');
      expect(result2).toBe('utf-16');
      expect(mockedChardetDetect).toHaveBeenCalledTimes(2);
    });

    it('should handle Windows system encoding', () => {
      mockedOsPlatform.mockReturnValue('win32');
      mockedExecSync.mockReturnValue('Active code page: 1252');

      const buffer = Buffer.from('test');
      const result = getCachedEncodingForBuffer(buffer);

      expect(result).toBe('windows-1252');
    });

    it('should cache null system encoding result', () => {
      // Reset the cache specifically for this test
      resetEncodingCache();

      // Ensure we're on Unix-like for this test
      mockedOsPlatform.mockReturnValue('linux');

      // System encoding detection returns null
      mockedExecSync.mockImplementation(() => {
        throw new Error('locale command failed');
      });

      const buffer1 = Buffer.from('test1');
      const buffer2 = Buffer.from('test2');

      mockedChardetDetect
        .mockReturnValueOnce('ISO-8859-1')
        .mockReturnValueOnce('UTF-16');

      // Clear any previous calls from beforeEach setup or previous tests
      mockedExecSync.mockClear();

      const result1 = getCachedEncodingForBuffer(buffer1);
      const result2 = getCachedEncodingForBuffer(buffer2);

      // Should call execSync only once due to caching (null result is cached)
      expect(mockedExecSync).toHaveBeenCalledTimes(1);
      expect(result1).toBe('iso-8859-1');
      expect(result2).toBe('utf-16');

      // Call a third time to verify cache is still used
      const buffer3 = Buffer.from('test3');
      mockedChardetDetect.mockReturnValueOnce('UTF-32');
      const result3 = getCachedEncodingForBuffer(buffer3);

      // Still should be only one call to execSync
      expect(mockedExecSync).toHaveBeenCalledTimes(1);
      expect(result3).toBe('utf-32');
    });
  });

  describe('Cross-platform behavior', () => {
    it('should work correctly on macOS', () => {
      mockedOsPlatform.mockReturnValue('darwin');
      process.env['LANG'] = 'en_US.UTF-8';

      const result = getSystemEncoding();
      expect(result).toBe('utf-8');
    });

    it('should work correctly on other Unix-like systems', () => {
      mockedOsPlatform.mockReturnValue('freebsd');
      process.env['LANG'] = 'en_US.UTF-8';

      const result = getSystemEncoding();
      expect(result).toBe('utf-8');
    });

    it('should handle unknown platforms as Unix-like', () => {
      mockedOsPlatform.mockReturnValue('unknown' as NodeJS.Platform);
      process.env['LANG'] = 'en_US.UTF-8';

      const result = getSystemEncoding();
      expect(result).toBe('utf-8');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty buffer gracefully', () => {
      mockedOsPlatform.mockReturnValue('linux');
      process.env['LANG'] = 'en_US.UTF-8';

      const buffer = Buffer.alloc(0);
      const result = getCachedEncodingForBuffer(buffer);
      expect(result).toBe('utf-8');
    });

    it('should handle very large buffers', () => {
      mockedOsPlatform.mockReturnValue('linux');
      process.env['LANG'] = 'en_US.UTF-8';

      const buffer = Buffer.alloc(1024 * 1024, 'a');
      const result = getCachedEncodingForBuffer(buffer);
      expect(result).toBe('utf-8');
    });

    it('should handle Unicode content', () => {
      mockedOsPlatform.mockReturnValue('linux');
      const unicodeText = '你好世界 🌍 ñoño';

      // System encoding fails
      mockedExecSync.mockImplementation(() => {
        throw new Error('locale command failed');
      });

      mockedChardetDetect.mockReturnValue('UTF-8');

      const buffer = Buffer.from(unicodeText, 'utf8');
      const result = getCachedEncodingForBuffer(buffer);
      expect(result).toBe('utf-8');
    });
  });
});
