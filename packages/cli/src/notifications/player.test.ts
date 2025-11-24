/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { platform } from 'node:os';
import { playSound } from './player.js';

// Mock child_process
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

// Mock fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

// Mock os
vi.mock('node:os', () => ({
  platform: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockPlatform = vi.mocked(platform);

describe('soundPlayer', () => {
  let mockChildProcess: {
    unref: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockChildProcess = {
      unref: vi.fn(),
      on: vi.fn(),
    };
    mockSpawn.mockReturnValue(
      mockChildProcess as unknown as ReturnType<typeof spawn>,
    );
    mockExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('playSound', () => {
    describe('macOS (darwin)', () => {
      beforeEach(() => {
        mockPlatform.mockReturnValue('darwin');
      });

      it('should play system sound using afplay', async () => {
        await playSound({ sound: 'system' }, 'inputRequired');

        expect(mockSpawn).toHaveBeenCalledWith(
          'afplay',
          ['/System/Library/Sounds/Glass.aiff'],
          expect.objectContaining({
            stdio: 'ignore',
            detached: true,
          }),
        );
        expect(mockChildProcess.unref).toHaveBeenCalled();
      });

      it('should play custom sound file using afplay', async () => {
        await playSound(
          { sound: 'custom', customPath: '/path/to/custom.aiff' },
          'inputRequired',
        );

        expect(mockExistsSync).toHaveBeenCalledWith('/path/to/custom.aiff');
        expect(mockSpawn).toHaveBeenCalledWith(
          'afplay',
          ['/path/to/custom.aiff'],
          expect.objectContaining({
            stdio: 'ignore',
            detached: true,
          }),
        );
      });

      it('should fallback to default sound if custom file does not exist', async () => {
        mockExistsSync.mockReturnValue(false);

        await playSound(
          { sound: 'custom', customPath: '/nonexistent.aiff' },
          'inputRequired',
        );

        // Should fallback to default sound (Glass.aiff for inputRequired on macOS)
        expect(mockSpawn).toHaveBeenCalledWith(
          'afplay',
          ['/System/Library/Sounds/Glass.aiff'],
          expect.objectContaining({
            stdio: 'ignore',
            detached: true,
          }),
        );
      });

      it('should use correct sound for taskComplete', async () => {
        await playSound({ sound: 'system' }, 'taskComplete');

        expect(mockSpawn).toHaveBeenCalledWith(
          'afplay',
          ['/System/Library/Sounds/Pop.aiff'],
          expect.any(Object),
        );
      });

      it('should use correct sound for idleAlert', async () => {
        await playSound({ sound: 'system' }, 'idleAlert');

        expect(mockSpawn).toHaveBeenCalledWith(
          'afplay',
          ['/System/Library/Sounds/Glass.aiff'],
          expect.any(Object),
        );
      });
    });

    describe('Linux', () => {
      beforeEach(() => {
        mockPlatform.mockReturnValue('linux');
      });

      it('should play system sound using paplay', async () => {
        await playSound({ sound: 'system' }, 'inputRequired');

        expect(mockSpawn).toHaveBeenCalledWith(
          'paplay',
          ['--volume=65536', 'bell'],
          expect.objectContaining({
            stdio: 'ignore',
            detached: true,
          }),
        );
      });

      it('should play custom sound file using paplay', async () => {
        await playSound(
          { sound: 'custom', customPath: '/path/to/custom.wav' },
          'inputRequired',
        );

        expect(mockExistsSync).toHaveBeenCalledWith('/path/to/custom.wav');
        expect(mockSpawn).toHaveBeenCalledWith(
          'paplay',
          ['/path/to/custom.wav'],
          expect.objectContaining({
            stdio: 'ignore',
            detached: true,
          }),
        );
      });

      it('should fallback to default sound if custom file does not exist', async () => {
        mockExistsSync.mockReturnValue(false);

        await playSound(
          { sound: 'custom', customPath: '/nonexistent.wav' },
          'inputRequired',
        );

        // Should fallback to default sound (bell for inputRequired on Linux)
        expect(mockSpawn).toHaveBeenCalledWith(
          'paplay',
          ['--volume=65536', 'bell'],
          expect.objectContaining({
            stdio: 'ignore',
            detached: true,
          }),
        );
      });

      it('should handle paplay error and try aplay fallback', async () => {
        mockChildProcess.on.mockImplementation((event, callback) => {
          if (event === 'error') {
            // Simulate error after a delay
            setTimeout(() => {
              callback(new Error('paplay not found'));
            }, 0);
          }
          return mockChildProcess;
        });

        await playSound({ sound: 'system' }, 'inputRequired');

        // Wait for error callback
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Should have tried paplay first
        expect(mockSpawn).toHaveBeenCalledWith(
          'paplay',
          expect.any(Array),
          expect.any(Object),
        );
      });
    });

    describe('Windows (win32)', () => {
      beforeEach(() => {
        mockPlatform.mockReturnValue('win32');
      });

      it('should play system sound using PowerShell', async () => {
        await playSound({ sound: 'system' }, 'inputRequired');

        expect(mockSpawn).toHaveBeenCalledWith(
          'powershell',
          ['-Command', '[System.Media.SystemSounds]::Asterisk.Play()'],
          expect.objectContaining({
            stdio: 'ignore',
            detached: true,
          }),
        );
      });

      it('should play custom sound file using PowerShell', async () => {
        await playSound(
          { sound: 'custom', customPath: 'C:\\path\\to\\custom.wav' },
          'inputRequired',
        );

        expect(mockExistsSync).toHaveBeenCalledWith('C:\\path\\to\\custom.wav');
        expect(mockSpawn).toHaveBeenCalledWith(
          'powershell',
          ['-Command', expect.stringContaining('System.Media.SoundPlayer')],
          expect.objectContaining({
            stdio: 'ignore',
            detached: true,
          }),
        );
      });

      it('should fallback to default sound if custom file does not exist', async () => {
        mockExistsSync.mockReturnValue(false);

        await playSound(
          { sound: 'custom', customPath: 'C:\\nonexistent.wav' },
          'inputRequired',
        );

        // Should fallback to default sound (Asterisk for inputRequired on Windows)
        expect(mockSpawn).toHaveBeenCalledWith(
          'powershell',
          ['-Command', '[System.Media.SystemSounds]::Asterisk.Play()'],
          expect.objectContaining({
            stdio: 'ignore',
            detached: true,
          }),
        );
      });

      it('should use correct system sound for taskComplete', async () => {
        await playSound({ sound: 'system' }, 'taskComplete');

        expect(mockSpawn).toHaveBeenCalledWith(
          'powershell',
          ['-Command', '[System.Media.SystemSounds]::Exclamation.Play()'],
          expect.any(Object),
        );
      });
    });

    describe('unsupported platform', () => {
      it('should handle unsupported platform gracefully', async () => {
        mockPlatform.mockReturnValue('freebsd' as NodeJS.Platform);

        // Should not throw, but also not play sound
        await playSound({ sound: 'system' }, 'inputRequired');

        // On unsupported platforms, getDefaultSound returns null
        // and playSound should return early
        expect(mockSpawn).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      beforeEach(() => {
        mockPlatform.mockReturnValue('darwin');
      });

      it('should handle spawn errors gracefully', async () => {
        const error = new Error('Command not found');
        mockSpawn.mockImplementation(() => {
          throw error;
        });

        // Should not throw and return fallback result
        await expect(
          playSound({ sound: 'system' }, 'inputRequired'),
        ).resolves.toEqual({ fallbackUsed: false });
      });

      it('should handle child process errors gracefully', async () => {
        mockChildProcess.on.mockImplementation((event, callback) => {
          if (event === 'error') {
            // Call error callback immediately
            callback(new Error('Process error'));
          }
          return mockChildProcess;
        });

        // Should not throw and return fallback result
        await expect(
          playSound({ sound: 'system' }, 'inputRequired'),
        ).resolves.toEqual({ fallbackUsed: false });
      });
    });
  });
});
