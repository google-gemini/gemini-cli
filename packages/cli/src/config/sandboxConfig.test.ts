/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPackageJson } from '@google/gemini-cli-core';
import commandExists from 'command-exists';
import * as os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSandboxConfig } from './sandboxConfig.js';

// Mock dependencies
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    getPackageJson: vi.fn(),
    FatalSandboxError: class extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'FatalSandboxError';
      }
    },
  };
});

vi.mock('command-exists', () => ({
  default: {
    sync: vi.fn(),
  },
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    platform: vi.fn(),
  };
});

const mockedGetPackageJson = vi.mocked(getPackageJson);
const mockedCommandExistsSync = vi.mocked(commandExists.sync);
const mockedOsPlatform = vi.mocked(os.platform);

describe('loadSandboxConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    mockedGetPackageJson.mockResolvedValue({
      config: { sandboxImageUri: 'default/image' },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return undefined if sandbox is explicitly disabled via argv', async () => {
    const config = await loadSandboxConfig({}, { sandbox: false });
    expect(config).toBeUndefined();
  });

  it('should return undefined if sandbox is explicitly disabled via settings', async () => {
    const config = await loadSandboxConfig({ tools: { sandbox: false } }, {});
    expect(config).toBeUndefined();
  });

  it('should return undefined if sandbox is not configured', async () => {
    const config = await loadSandboxConfig({}, {});
    expect(config).toBeUndefined();
  });

  it('should return undefined if already inside a sandbox (SANDBOX env var is set)', async () => {
    process.env['SANDBOX'] = '1';
    const config = await loadSandboxConfig({}, { sandbox: true });
    expect(config).toBeUndefined();
  });

  describe('with GEMINI_SANDBOX environment variable', () => {
    it('should use docker if GEMINI_SANDBOX=docker and it exists', async () => {
      process.env['GEMINI_SANDBOX'] = 'docker';
      mockedCommandExistsSync.mockReturnValue(true);
      const config = await loadSandboxConfig({}, {});
      expect(config).toEqual({ command: 'docker', image: 'default/image' });
      expect(mockedCommandExistsSync).toHaveBeenCalledWith('docker');
    });

    it('should throw if GEMINI_SANDBOX is an invalid command', async () => {
      process.env['GEMINI_SANDBOX'] = 'invalid-command';
      await expect(loadSandboxConfig({}, {})).rejects.toThrow(
        "Invalid sandbox command 'invalid-command'. Must be one of docker, podman, sandbox-exec",
      );
    });

    it('should throw if GEMINI_SANDBOX command does not exist', async () => {
      process.env['GEMINI_SANDBOX'] = 'docker';
      mockedCommandExistsSync.mockReturnValue(false);
      await expect(loadSandboxConfig({}, {})).rejects.toThrow(
        "Missing sandbox command 'docker' (from GEMINI_SANDBOX)",
      );
    });
  });

  describe('with sandbox: true', () => {
    it('should use sandbox-exec on darwin if available', async () => {
      mockedOsPlatform.mockReturnValue('darwin');
      mockedCommandExistsSync.mockImplementation(
        (cmd) => cmd === 'sandbox-exec',
      );
      const config = await loadSandboxConfig({}, { sandbox: true });
      expect(config).toEqual({
        command: 'sandbox-exec',
        image: 'default/image',
      });
    });

    it('should prefer sandbox-exec over docker on darwin', async () => {
      mockedOsPlatform.mockReturnValue('darwin');
      mockedCommandExistsSync.mockReturnValue(true); // all commands exist
      const config = await loadSandboxConfig({}, { sandbox: true });
      expect(config).toEqual({
        command: 'sandbox-exec',
        image: 'default/image',
      });
    });

    it('should use docker if available and sandbox is true', async () => {
      mockedOsPlatform.mockReturnValue('linux');
      mockedCommandExistsSync.mockImplementation((cmd) => cmd === 'docker');
      const config = await loadSandboxConfig({ tools: { sandbox: true } }, {});
      expect(config).toEqual({ command: 'docker', image: 'default/image' });
    });

    it('should use podman if available and docker is not', async () => {
      mockedOsPlatform.mockReturnValue('linux');
      mockedCommandExistsSync.mockImplementation((cmd) => cmd === 'podman');
      const config = await loadSandboxConfig({}, { sandbox: true });
      expect(config).toEqual({ command: 'podman', image: 'default/image' });
    });

    it('should throw if sandbox: true but no command is found', async () => {
      mockedOsPlatform.mockReturnValue('linux');
      mockedCommandExistsSync.mockReturnValue(false);
      await expect(loadSandboxConfig({}, { sandbox: true })).rejects.toThrow(
        'GEMINI_SANDBOX is true but failed to determine command for sandbox; ' +
          'install docker or podman or specify command in GEMINI_SANDBOX',
      );
    });
  });

  describe("with sandbox: 'command'", () => {
    it('should use the specified command if it exists', async () => {
      mockedCommandExistsSync.mockReturnValue(true);
      const config = await loadSandboxConfig({}, { sandbox: 'podman' });
      expect(config).toEqual({ command: 'podman', image: 'default/image' });
      expect(mockedCommandExistsSync).toHaveBeenCalledWith('podman');
    });

    it('should throw if the specified command does not exist', async () => {
      mockedCommandExistsSync.mockReturnValue(false);
      await expect(
        loadSandboxConfig({}, { sandbox: 'podman' }),
      ).rejects.toThrow(
        "Missing sandbox command 'podman' (from GEMINI_SANDBOX)",
      );
    });

    it('should throw if the specified command is invalid', async () => {
      await expect(
        loadSandboxConfig({}, { sandbox: 'invalid-command' }),
      ).rejects.toThrow(
        "Invalid sandbox command 'invalid-command'. Must be one of docker, podman, sandbox-exec",
      );
    });
  });

  describe('image configuration', () => {
    it('should use image from GEMINI_SANDBOX_IMAGE env var if set', async () => {
      process.env['GEMINI_SANDBOX_IMAGE'] = 'env/image';
      process.env['GEMINI_SANDBOX'] = 'docker';
      mockedCommandExistsSync.mockReturnValue(true);
      const config = await loadSandboxConfig({}, {});
      expect(config).toEqual({ command: 'docker', image: 'env/image' });
    });

    it('should use image from package.json if env var is not set', async () => {
      process.env['GEMINI_SANDBOX'] = 'docker';
      mockedCommandExistsSync.mockReturnValue(true);
      const config = await loadSandboxConfig({}, {});
      expect(config).toEqual({ command: 'docker', image: 'default/image' });
    });

    it('should return undefined if command is found but no image is configured', async () => {
      mockedGetPackageJson.mockResolvedValue({}); // no sandboxImageUri
      process.env['GEMINI_SANDBOX'] = 'docker';
      mockedCommandExistsSync.mockReturnValue(true);
      const config = await loadSandboxConfig({}, {});
      expect(config).toBeUndefined();
    });
  });

  describe('truthy/falsy sandbox values', () => {
    beforeEach(() => {
      mockedOsPlatform.mockReturnValue('linux');
      mockedCommandExistsSync.mockImplementation((cmd) => cmd === 'docker');
    });

    it.each([true, 'true', '1'])(
      'should enable sandbox for value: %s',
      async (value) => {
        const config = await loadSandboxConfig({}, { sandbox: value });
        expect(config).toEqual({ command: 'docker', image: 'default/image' });
      },
    );

    it.each([false, 'false', '0', undefined, null, ''])(
      'should disable sandbox for value: %s',
      async (value) => {
        // \`null\` is not a valid type for the arg, but good to test falsiness
        const config = await loadSandboxConfig({}, { sandbox: value });
        expect(config).toBeUndefined();
      },
    );
  });
});
