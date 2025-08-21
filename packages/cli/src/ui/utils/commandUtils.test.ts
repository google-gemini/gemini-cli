/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import { spawn, SpawnOptions } from 'child_process';
import { EventEmitter } from 'events';
import {
  isAtCommand,
  isSlashCommand,
  copyToClipboard,
  getUrlOpenCommand,
} from './commandUtils.js';

// Mock child_process
vi.mock('child_process');

// Mock process.platform for platform-specific tests
const mockProcess = vi.hoisted(() => ({
  platform: 'darwin',
}));

vi.stubGlobal('process', {
  ...process,
  get platform() {
    return mockProcess.platform;
  },
});

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

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamically import and set up spawn mock
    const { spawn } = await import('child_process');
    mockSpawn = spawn as Mock;

    // Create mock child process with stdout/stderr emitters
    mockChild = Object.assign(new EventEmitter(), {
      stdin: Object.assign(new EventEmitter(), {
        write: vi.fn(),
        end: vi.fn(),
      }),
      stderr: new EventEmitter(),
    }) as MockChildProcess;

    mockSpawn.mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);
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
  });

  describe('copyToClipboard', () => {
    describe('on macOS (darwin)', () => {
      beforeEach(() => {
        mockProcess.platform = 'darwin';
      });

      it('should successfully copy text to clipboard using pbcopy', async () => {
        const testText = 'Hello, world!';

        // Simulate successful execution
        setTimeout(() => {
          mockChild.emit('close', 0);
        }, 0);

        await copyToClipboard(testText);

        expect(mockSpawn).toHaveBeenCalledWith('pbcopy', []);
        expect(mockChild.stdin.write).toHaveBeenCalledWith(testText);
        expect(mockChild.stdin.end).toHaveBeenCalled();
      });

      it('should handle pbcopy command failure', async () => {
        const testText = 'Hello, world!';

        // Simulate command failure
        setTimeout(() => {
          mockChild.stderr.emit('data', 'Command not found');
          mockChild.emit('close', 1);
        }, 0);

        await expect(copyToClipboard(testText)).rejects.toThrow(
          "'pbcopy' exited with code 1: Command not found",
        );
      });

      it('should handle spawn error', async () => {
        const testText = 'Hello, world!';

        setTimeout(() => {
          mockChild.emit('error', new Error('spawn error'));
        }, 0);

        await expect(copyToClipboard(testText)).rejects.toThrow('spawn error');
      });

      it('should handle stdin write error', async () => {
        const testText = 'Hello, world!';

        setTimeout(() => {
          mockChild.stdin.emit('error', new Error('stdin error'));
        }, 0);

        await expect(copyToClipboard(testText)).rejects.toThrow('stdin error');
      });
    });

    describe('on Windows (win32)', () => {
      beforeEach(() => {
        mockProcess.platform = 'win32';
      });

      it('should successfully copy text to clipboard using clip', async () => {
        const testText = 'Hello, world!';

        setTimeout(() => {
          mockChild.emit('close', 0);
        }, 0);

        await copyToClipboard(testText);

        expect(mockSpawn).toHaveBeenCalledWith('clip', []);
        expect(mockChild.stdin.write).toHaveBeenCalledWith(testText);
        expect(mockChild.stdin.end).toHaveBeenCalled();
      });
    });

    describe('on Linux', () => {
      beforeEach(() => {
        mockProcess.platform = 'linux';
      });

      it('should successfully copy text to clipboard using xclip', async () => {
        const testText = 'Hello, world!';
        const linuxOptions: SpawnOptions = {
          stdio: ['pipe', 'inherit', 'pipe'],
        };

        setTimeout(() => {
          mockChild.emit('close', 0);
        }, 0);

        await copyToClipboard(testText);

        expect(mockSpawn).toHaveBeenCalledWith(
          'xclip',
          ['-selection', 'clipboard'],
          linuxOptions,
        );
        expect(mockChild.stdin.write).toHaveBeenCalledWith(testText);
        expect(mockChild.stdin.end).toHaveBeenCalled();
      });

      it('should fall back to xsel when xclip fails', async () => {
        const testText = 'Hello, world!';
        let callCount = 0;
        const linuxOptions: SpawnOptions = {
          stdio: ['pipe', 'inherit', 'pipe'],
        };

        mockSpawn.mockImplementation(() => {
          const child = Object.assign(new EventEmitter(), {
            stdin: Object.assign(new EventEmitter(), {
              write: vi.fn(),
              end: vi.fn(),
            }),
            stderr: new EventEmitter(),
          }) as MockChildProcess;

          setTimeout(() => {
            if (callCount === 0) {
              // First call (xclip) fails
              child.stderr.emit('data', 'xclip not found');
              child.emit('close', 1);
              callCount++;
            } else {
              // Second call (xsel) succeeds
              child.emit('close', 0);
            }
          }, 0);

          return child as unknown as ReturnType<typeof spawn>;
        });

        await copyToClipboard(testText);

        expect(mockSpawn).toHaveBeenCalledTimes(2);
        expect(mockSpawn).toHaveBeenNthCalledWith(
          1,
          'xclip',
          ['-selection', 'clipboard'],
          linuxOptions,
        );
        expect(mockSpawn).toHaveBeenNthCalledWith(
          2,
          'xsel',
          ['--clipboard', '--input'],
          linuxOptions,
        );
      });

      it('should throw error when both xclip and xsel fail', async () => {
        const testText = 'Hello, world!';
        let callCount = 0;

        mockSpawn.mockImplementation(() => {
          const child = Object.assign(new EventEmitter(), {
            stdin: Object.assign(new EventEmitter(), {
              write: vi.fn(),
              end: vi.fn(),
            }),
            stderr: new EventEmitter(),
          });

          setTimeout(() => {
            if (callCount === 0) {
              // First call (xclip) fails
              child.stderr.emit('data', 'xclip command not found');
              child.emit('close', 1);
              callCount++;
            } else {
              // Second call (xsel) fails
              child.stderr.emit('data', 'xsel command not found');
              child.emit('close', 1);
            }
          }, 0);

          return child as unknown as ReturnType<typeof spawn>;
        });

        await expect(copyToClipboard(testText)).rejects.toThrow(
          /All copy commands failed/,
        );

        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });
    });

    describe('on unsupported platform', () => {
      beforeEach(() => {
        mockProcess.platform = 'unsupported';
      });

      it('should throw error for unsupported platform', async () => {
        await expect(copyToClipboard('test')).rejects.toThrow(
          'Unsupported platform: unsupported',
        );
      });
    });

    describe('error handling', () => {
      beforeEach(() => {
        mockProcess.platform = 'darwin';
      });

      it('should handle command exit without stderr', async () => {
        const testText = 'Hello, world!';

        setTimeout(() => {
          mockChild.emit('close', 1);
        }, 0);

        await expect(copyToClipboard(testText)).rejects.toThrow(
          "'pbcopy' exited with code 1",
        );
      });

      it('should handle empty text', async () => {
        setTimeout(() => {
          mockChild.emit('close', 0);
        }, 0);

        await copyToClipboard('');

        expect(mockChild.stdin.write).toHaveBeenCalledWith('');
      });

      it('should handle multiline text', async () => {
        const multilineText = 'Line 1\nLine 2\nLine 3';

        setTimeout(() => {
          mockChild.emit('close', 0);
        }, 0);

        await copyToClipboard(multilineText);

        expect(mockChild.stdin.write).toHaveBeenCalledWith(multilineText);
      });

      it('should handle special characters', async () => {
        const specialText = 'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?';

        setTimeout(() => {
          mockChild.emit('close', 0);
        }, 0);

        await copyToClipboard(specialText);

        expect(mockChild.stdin.write).toHaveBeenCalledWith(specialText);
      });
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
