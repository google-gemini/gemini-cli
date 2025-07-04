/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { escapeShellArg, escapeGitCommitMessage } from './shellEscape.js';
import * as os from 'os';

describe('escapeShellArg', () => {
  // Store original platform
  const originalPlatform = Object.getOwnPropertyDescriptor(os, 'platform');

  afterEach(() => {
    // Restore original platform
    if (originalPlatform) {
      Object.defineProperty(os, 'platform', originalPlatform);
    }
  });

  describe('POSIX systems (Linux/macOS)', () => {
    beforeEach(() => {
      // Mock os.platform to return 'darwin' (macOS)
      Object.defineProperty(os, 'platform', {
        value: () => 'darwin',
        configurable: true
      });
    });

    it('should not escape simple alphanumeric strings', () => {
      expect(escapeShellArg('HelloWorld123')).toBe('HelloWorld123');
      expect(escapeShellArg('test-file_name.txt')).toBe('test-file_name.txt');
    });

    it('should escape empty strings', () => {
      expect(escapeShellArg('')).toBe("''");
    });

    it('should escape strings with spaces', () => {
      expect(escapeShellArg('hello world')).toBe("'hello world'");
    });

    it('should escape strings with backticks', () => {
      expect(escapeShellArg('Fix `bug` in code')).toBe("'Fix `bug` in code'");
      expect(escapeShellArg('Run `echo test`')).toBe("'Run `echo test`'");
    });

    it('should escape strings with command substitution', () => {
      expect(escapeShellArg('$(rm -rf /)')).toBe("'$(rm -rf /)'");
      expect(escapeShellArg('`rm -rf /`')).toBe("'`rm -rf /`'");
    });

    it('should escape strings with single quotes', () => {
      expect(escapeShellArg("don't")).toBe("'don'\\''t'");
      expect(escapeShellArg("it's a test")).toBe("'it'\\''s a test'");
    });

    it('should escape strings with special characters', () => {
      expect(escapeShellArg('test&test')).toBe("'test&test'");
      expect(escapeShellArg('test|test')).toBe("'test|test'");
      expect(escapeShellArg('test;test')).toBe("'test;test'");
      expect(escapeShellArg('test>test')).toBe("'test>test'");
      expect(escapeShellArg('test<test')).toBe("'test<test'");
    });

    it('should escape strings with newlines', () => {
      expect(escapeShellArg('line1\nline2')).toBe("'line1\nline2'");
    });

    it('should handle complex combinations', () => {
      expect(escapeShellArg("Fix `bug` in Mary's code")).toBe("'Fix `bug` in Mary'\\''s code'");
    });
  });

  describe('Windows systems', () => {
    beforeEach(() => {
      // Mock os.platform to return 'win32'
      Object.defineProperty(os, 'platform', {
        value: () => 'win32',
        configurable: true
      });
    });

    it('should not escape simple alphanumeric strings', () => {
      expect(escapeShellArg('HelloWorld123')).toBe('HelloWorld123');
      expect(escapeShellArg('test-file_name')).toBe('test-file_name');
    });

    it('should escape empty strings', () => {
      expect(escapeShellArg('')).toBe('""');
    });

    it('should escape strings with spaces', () => {
      expect(escapeShellArg('hello world')).toBe('"hello world"');
    });

    it('should escape strings with double quotes', () => {
      expect(escapeShellArg('say "hello"')).toBe('"say ""hello"""');
    });

    it('should escape cmd.exe special characters with caret', () => {
      expect(escapeShellArg('command & echo')).toBe('"command ^& echo"');
      expect(escapeShellArg('first | second')).toBe('"first ^| second"');
      expect(escapeShellArg('echo > file')).toBe('"echo ^> file"');
      expect(escapeShellArg('cat < input')).toBe('"cat ^< input"');
    });

    it('should escape percent signs by doubling', () => {
      expect(escapeShellArg('%PATH%')).toBe('"%%PATH%%"');
      expect(escapeShellArg('100% complete')).toBe('"100%% complete"');
    });

    it('should escape caret characters', () => {
      expect(escapeShellArg('test^character')).toBe('"test^^character"');
    });

    it('should handle complex Windows injection attempts', () => {
      expect(escapeShellArg('& del /f /q *.*')).toBe('"^& del /f /q *.*"');
      expect(escapeShellArg('| format c:')).toBe('"^| format c:"');
      expect(escapeShellArg('"; echo "hacked')).toBe('""; echo ""hacked"');
    });

    it('should handle backticks (no special meaning in cmd.exe)', () => {
      expect(escapeShellArg('Fix `bug` in code')).toBe('"Fix `bug` in code"');
    });
  });
});

describe('escapeGitCommitMessage', () => {
  it('should escape commit messages with backticks', () => {
    // Set to POSIX for predictable test
    Object.defineProperty(os, 'platform', {
      value: () => 'darwin',
      configurable: true
    });
    expect(escapeGitCommitMessage('Fix `ComponentName` rendering issue')).toBe("'Fix `ComponentName` rendering issue'");
  });

  it('should handle commit messages with potential command injection', () => {
    // Set to POSIX for predictable test
    Object.defineProperty(os, 'platform', {
      value: () => 'darwin',
      configurable: true
    });
    expect(escapeGitCommitMessage('Update code `rm -rf /` (example)')).toBe("'Update code `rm -rf /` (example)'");
  });

  it('should handle normal commit messages without special characters', () => {
    // Simple messages without special characters don't need escaping
    expect(escapeGitCommitMessage('Update-README.md')).toBe('Update-README.md');
    expect(escapeGitCommitMessage('Add-new-feature_123')).toBe('Add-new-feature_123');
  });
  
  it('should escape commit messages with spaces on Windows', () => {
    Object.defineProperty(os, 'platform', {
      value: () => 'win32',
      configurable: true
    });
    expect(escapeGitCommitMessage('Update README.md')).toBe('"Update README.md"');
    expect(escapeGitCommitMessage('Update README file')).toBe('"Update README file"');
  });
});