/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Mock } from 'vitest';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import clipboardy from 'clipboardy';
import {
  isAtCommand,
  isSlashCommand,
  copyToClipboard,
  getUrlOpenCommand,
} from './commandUtils.js';

// Mock clipboardy
vi.mock('clipboardy', () => ({
  default: {
    write: vi.fn(),
  },
}));

// Mock child_process
vi.mock('child_process');

// Mock process.platform for platform-specific tests
const mockProcess = vi.hoisted(() => ({
  platform: 'darwin',
}));

vi.stubGlobal(
  'process',
  Object.create(process, {
    platform: {
      get: () => mockProcess.platform,
      configurable: true, // Allows the property to be changed later if needed
    },
  }),
);

interface MockChildProcess extends EventEmitter {
  stdin: EventEmitter & {
    write: Mock;
    end: Mock;
  };
  stderr: EventEmitter;
}

describe('commandUtils', () => {
  let mockSpawn: Mock;
  let mockChild: MockChildProcess;
  let mockClipboardyWrite: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamically import and set up spawn mock
    const { spawn } = await import('node:child_process');
    mockSpawn = spawn as Mock;

    // Create mock child process with stdout/stderr emitters
    mockChild = Object.assign(new EventEmitter(), {
      stdin: Object.assign(new EventEmitter(), {
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      }),
      stdout: Object.assign(new EventEmitter(), {
        destroy: vi.fn(),
      }),
      stderr: Object.assign(new EventEmitter(), {
        destroy: vi.fn(),
      }),
    }) as MockChildProcess;

    mockSpawn.mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

    // Setup clipboardy mock
    mockClipboardyWrite = clipboardy.write as Mock;
  });

  describe('isAtCommand', () => {
    it('should return true when query starts with @', () => {
      expect(isAtCommand('@file')).toBe(true);
      expect(isAtCommand('@path/to/file')).toBe(true);
      expect(isAtCommand('@')).toBe(true);
    });

    it('should return true when query contains @ preceded by whitespace', () => {
      expect(isAtCommand('hello @file')).toBe(true);
      expect(isAtCommand('some text @path/to/file')).toBe(true);
      expect(isAtCommand('   @file')).toBe(true);
    });

    it('should return false when query does not start with @ and has no spaced @', () => {
      expect(isAtCommand('file')).toBe(false);
      expect(isAtCommand('hello')).toBe(false);
      expect(isAtCommand('')).toBe(false);
      expect(isAtCommand('email@domain.com')).toBe(false);
      expect(isAtCommand('user@host')).toBe(false);
    });

    it('should return false when @ is not preceded by whitespace', () => {
      expect(isAtCommand('hello@file')).toBe(false);
      expect(isAtCommand('text@path')).toBe(false);
    });
  });

  describe('isSlashCommand', () => {
    it('should return true when query starts with /', () => {
      expect(isSlashCommand('/help')).toBe(true);
      expect(isSlashCommand('/memory show')).toBe(true);
      expect(isSlashCommand('/clear')).toBe(true);
      expect(isSlashCommand('/')).toBe(true);
    });

    it('should return false when query does not start with /', () => {
      expect(isSlashCommand('help')).toBe(false);
      expect(isSlashCommand('memory show')).toBe(false);
      expect(isSlashCommand('')).toBe(false);
      expect(isSlashCommand('path/to/file')).toBe(false);
      expect(isSlashCommand(' /help')).toBe(false);
    });

    it('should return false for line comments starting with //', () => {
      expect(isSlashCommand('// This is a comment')).toBe(false);
      expect(isSlashCommand('// check if variants base info all filled.')).toBe(
        false,
      );
      expect(isSlashCommand('//comment without space')).toBe(false);
    });

    it('should return false for block comments starting with /*', () => {
      expect(isSlashCommand('/* This is a block comment */')).toBe(false);
      expect(isSlashCommand('/*\n * Multi-line comment\n */')).toBe(false);
      expect(isSlashCommand('/*comment without space*/')).toBe(false);
    });
  });

  describe('copyToClipboard', () => {
    it('should successfully copy text to clipboard using clipboardy', async () => {
      const testText = 'Hello, world!';
      mockClipboardyWrite.mockResolvedValue(undefined);

      await copyToClipboard(testText);

      expect(mockClipboardyWrite).toHaveBeenCalledWith(testText);
    });

    it('should propagate errors from clipboardy', async () => {
      const testText = 'Hello, world!';
      const error = new Error('Clipboard error');
      mockClipboardyWrite.mockRejectedValue(error);

      await expect(copyToClipboard(testText)).rejects.toThrow(
        'Clipboard error',
      );
    });
  });

  describe('getUrlOpenCommand', () => {
    describe('on macOS (darwin)', () => {
      beforeEach(() => {
        mockProcess.platform = 'darwin';
      });
      it('should return open', () => {
        expect(getUrlOpenCommand()).toBe('open');
      });
    });

    describe('on Windows (win32)', () => {
      beforeEach(() => {
        mockProcess.platform = 'win32';
      });
      it('should return start', () => {
        expect(getUrlOpenCommand()).toBe('start');
      });
    });

    describe('on Linux (linux)', () => {
      beforeEach(() => {
        mockProcess.platform = 'linux';
      });
      it('should return xdg-open', () => {
        expect(getUrlOpenCommand()).toBe('xdg-open');
      });
    });

    describe('on unmatched OS', () => {
      beforeEach(() => {
        mockProcess.platform = 'unmatched';
      });
      it('should return xdg-open', () => {
        expect(getUrlOpenCommand()).toBe('xdg-open');
      });
    });
  });
});
