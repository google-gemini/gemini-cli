/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SandboxOrchestrator } from './sandboxOrchestrator.js';
import type { SandboxConfig } from '../config/config.js';
import { spawnAsync } from './shell-utils.js';

vi.mock('./shell-utils.js', () => ({
  spawnAsync: vi.fn(),
}));
vi.mock('../index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../index.js')>();
  return {
    ...actual,
    debugLogger: {
      log: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    },
    coreEvents: {
      emitFeedback: vi.fn(),
    },
    LOCAL_DEV_SANDBOX_IMAGE_NAME: 'gemini-cli-sandbox',
  };
});

describe('SandboxOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('getContainerRunArgs', () => {
    it('should build basic run args', async () => {
      const config: SandboxConfig = {
        command: 'docker',
        image: 'some-image',
      };
      const args = await SandboxOrchestrator.getContainerRunArgs(
        config,
        '/work',
        '/sandbox',
      );
      expect(args).toEqual([
        'run',
        '-i',
        '--rm',
        '--init',
        '--workdir',
        '/sandbox',
        '-t',
        '--add-host',
        'host.docker.internal:host-gateway',
        '--volume',
        '/work:/sandbox',
      ]);
    });

    it('should include flags from config', async () => {
      const config: SandboxConfig = {
        command: 'docker',
        image: 'some-image',
        flags: '--privileged --net=host',
      };
      const args = await SandboxOrchestrator.getContainerRunArgs(
        config,
        '/work',
        '/sandbox',
      );
      expect(args).toEqual([
        'run',
        '-i',
        '--rm',
        '--init',
        '--workdir',
        '/sandbox',
        '--privileged',
        '--net=host',
        '-t',
        '--add-host',
        'host.docker.internal:host-gateway',
        '--volume',
        '/work:/sandbox',
      ]);
    });

    it('should include flags from arguments if provided', async () => {
      const config: SandboxConfig = {
        command: 'docker',
        image: 'some-image',
      };
      const args = await SandboxOrchestrator.getContainerRunArgs(
        config,
        '/work',
        '/sandbox',
        '--env FOO=bar',
      );
      expect(args).toEqual([
        'run',
        '-i',
        '--rm',
        '--init',
        '--workdir',
        '/sandbox',
        '--env',
        'FOO=bar',
        '-t',
        '--add-host',
        'host.docker.internal:host-gateway',
        '--volume',
        '/work:/sandbox',
      ]);
    });

    it('should expand environment variables in flags', async () => {
      vi.stubEnv('TEST_VAR', 'test-value');
      const config: SandboxConfig = {
        command: 'docker',
        image: 'some-image',
        flags: '--label user=$TEST_VAR',
      };
      const args = await SandboxOrchestrator.getContainerRunArgs(
        config,
        '/work',
        '/sandbox',
      );
      expect(args).toEqual([
        'run',
        '-i',
        '--rm',
        '--init',
        '--workdir',
        '/sandbox',
        '--label',
        'user=test-value',
        '-t',
        '--add-host',
        'host.docker.internal:host-gateway',
        '--volume',
        '/work:/sandbox',
      ]);
    });

    it('should handle complex quoted flags', async () => {
      const config: SandboxConfig = {
        command: 'docker',
        image: 'some-image',
        flags: '--env "FOO=bar baz" --label \'key=val with spaces\'',
      };
      const args = await SandboxOrchestrator.getContainerRunArgs(
        config,
        '/work',
        '/sandbox',
      );
      expect(args).toEqual([
        'run',
        '-i',
        '--rm',
        '--init',
        '--workdir',
        '/sandbox',
        '--env',
        'FOO=bar baz',
        '--label',
        'key=val with spaces',
        '-t',
        '--add-host',
        'host.docker.internal:host-gateway',
        '--volume',
        '/work:/sandbox',
      ]);
    });

    it('should filter out non-string shell-quote Op objects', async () => {
      const config: SandboxConfig = {
        command: 'docker',
        image: 'some-image',
        flags: '--flag > /tmp/out', // shell-quote would return { op: '>' }
      };
      const args = await SandboxOrchestrator.getContainerRunArgs(
        config,
        '/work',
        '/sandbox',
      );
      expect(args).toEqual([
        'run',
        '-i',
        '--rm',
        '--init',
        '--workdir',
        '/sandbox',
        '--flag',
        '/tmp/out',
        '-t',
        '--add-host',
        'host.docker.internal:host-gateway',
        '--volume',
        '/work:/sandbox',
      ]);
      // Note: shell-quote filters out the '>' op but keeps the surrounding strings
    });
  });

  describe('ensureSandboxImageIsPresent', () => {
    it('should return true if image exists locally', async () => {
      vi.mocked(spawnAsync).mockResolvedValueOnce({
        stdout: 'image-id',
        stderr: '',
      });

      const result = await SandboxOrchestrator.ensureSandboxImageIsPresent(
        'docker',
        'some-image',
      );
      expect(result).toBe(true);
      expect(spawnAsync).toHaveBeenCalledWith('docker', [
        'images',
        '-q',
        'some-image',
      ]);
    });

    it('should pull image if missing and return true on success', async () => {
      // 1. Image check fails (returns empty stdout)
      vi.mocked(spawnAsync).mockResolvedValueOnce({ stdout: '', stderr: '' });
      // 2. Pull image succeeds
      vi.mocked(spawnAsync).mockResolvedValueOnce({
        stdout: 'Successfully pulled',
        stderr: '',
      });
      // 3. Image check succeeds
      vi.mocked(spawnAsync).mockResolvedValueOnce({
        stdout: 'image-id',
        stderr: '',
      });

      const result = await SandboxOrchestrator.ensureSandboxImageIsPresent(
        'docker',
        'some-image',
      );
      expect(result).toBe(true);
      expect(spawnAsync).toHaveBeenCalledWith('docker', ['pull', 'some-image']);
    });

    it('should return false if image pull fails', async () => {
      // 1. Image check fails
      vi.mocked(spawnAsync).mockResolvedValueOnce({ stdout: '', stderr: '' });
      // 2. Pull image fails
      vi.mocked(spawnAsync).mockRejectedValueOnce(new Error('Pull failed'));

      const result = await SandboxOrchestrator.ensureSandboxImageIsPresent(
        'docker',
        'some-image',
      );
      expect(result).toBe(false);
    });
  });
});
