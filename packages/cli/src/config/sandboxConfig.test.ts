/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { loadSandboxConfig } from './sandboxConfig.js';
import type { Settings } from './settings.js';
import { FatalSandboxError } from '@google/gemini-cli-core';
import commandExists from 'command-exists';
import * as os from 'node:os';
import * as packageModule from '../utils/package.js';

vi.mock('command-exists');
vi.mock('node:os');
vi.mock('../utils/package.js');

describe('sandboxConfig', () => {
  let mockSettings: Settings;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['SANDBOX'];
    delete process.env['GEMINI_SANDBOX'];
    delete process.env['GEMINI_SANDBOX_IMAGE'];

    mockSettings = {
      tools: {
        sandbox: false,
      },
    } as Settings;

    vi.mocked(commandExists.sync).mockReturnValue(false);
    vi.mocked(os.platform).mockReturnValue('linux');
    vi.mocked(packageModule.getPackageJson).mockResolvedValue({
      config: {
        sandboxImageUri: 'default-image:latest',
      },
    } as never);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('loadSandboxConfig', () => {
    describe('disabled state', () => {
      it('should return undefined when sandbox is false', async () => {
        const result = await loadSandboxConfig(mockSettings, {
          sandbox: false,
        });

        expect(result).toBeUndefined();
      });

      it('should return undefined when sandbox not specified', async () => {
        const result = await loadSandboxConfig(mockSettings, {});

        expect(result).toBeUndefined();
      });

      it('should return undefined when no command available', async () => {
        const result = await loadSandboxConfig(mockSettings, {
          sandbox: true,
        });

        expect(result).toBeUndefined();
      });

      it('should return undefined when already in sandbox', async () => {
        process.env['SANDBOX'] = 'true';
        vi.mocked(commandExists.sync).mockReturnValue(true);

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: 'docker',
        });

        expect(result).toBeUndefined();
      });
    });

    describe('environment variable GEMINI_SANDBOX', () => {
      it('should use GEMINI_SANDBOX over argv', async () => {
        process.env['GEMINI_SANDBOX'] = 'docker';
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'docker',
        );

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: 'podman',
        });

        expect(result?.command).toBe('docker');
      });

      it('should handle GEMINI_SANDBOX=true', async () => {
        process.env['GEMINI_SANDBOX'] = 'true';
        vi.mocked(os.platform).mockReturnValue('darwin');
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'sandbox-exec',
        );

        const result = await loadSandboxConfig(mockSettings, {});

        expect(result?.command).toBe('sandbox-exec');
      });

      it('should handle GEMINI_SANDBOX=1', async () => {
        process.env['GEMINI_SANDBOX'] = '1';
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'docker',
        );

        const result = await loadSandboxConfig(mockSettings, {});

        expect(result?.command).toBe('docker');
      });

      it('should handle GEMINI_SANDBOX=false', async () => {
        process.env['GEMINI_SANDBOX'] = 'false';

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: true,
        });

        expect(result).toBeUndefined();
      });

      it('should handle GEMINI_SANDBOX=0', async () => {
        process.env['GEMINI_SANDBOX'] = '0';

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: true,
        });

        expect(result).toBeUndefined();
      });

      it('should trim whitespace from GEMINI_SANDBOX', async () => {
        process.env['GEMINI_SANDBOX'] = '  docker  ';
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'docker',
        );

        const result = await loadSandboxConfig(mockSettings, {});

        expect(result?.command).toBe('docker');
      });

      it('should convert GEMINI_SANDBOX to lowercase', async () => {
        process.env['GEMINI_SANDBOX'] = 'DOCKER';
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'docker',
        );

        const result = await loadSandboxConfig(mockSettings, {});

        expect(result?.command).toBe('docker');
      });
    });

    describe('docker command', () => {
      it('should use docker when available and sandbox=true', async () => {
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'docker',
        );

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: true,
        });

        expect(result?.command).toBe('docker');
      });

      it('should use docker from argv', async () => {
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'docker',
        );

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: 'docker',
        });

        expect(result?.command).toBe('docker');
      });

      it('should use docker from settings', async () => {
        mockSettings.tools!.sandbox = 'docker';
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'docker',
        );

        const result = await loadSandboxConfig(mockSettings, {});

        expect(result?.command).toBe('docker');
      });

      it('should throw when docker specified but not found', async () => {
        await expect(
          loadSandboxConfig(mockSettings, { sandbox: 'docker' }),
        ).rejects.toThrow(FatalSandboxError);

        await expect(
          loadSandboxConfig(mockSettings, { sandbox: 'docker' }),
        ).rejects.toThrow("Missing sandbox command 'docker'");
      });
    });

    describe('podman command', () => {
      it('should use podman when docker not available', async () => {
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'podman',
        );

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: true,
        });

        expect(result?.command).toBe('podman');
      });

      it('should use podman from argv', async () => {
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'podman',
        );

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: 'podman',
        });

        expect(result?.command).toBe('podman');
      });

      it('should prefer docker over podman when both available', async () => {
        vi.mocked(commandExists.sync).mockReturnValue(true);

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: true,
        });

        expect(result?.command).toBe('docker');
      });

      it('should throw when podman specified but not found', async () => {
        await expect(
          loadSandboxConfig(mockSettings, { sandbox: 'podman' }),
        ).rejects.toThrow(FatalSandboxError);

        await expect(
          loadSandboxConfig(mockSettings, { sandbox: 'podman' }),
        ).rejects.toThrow("Missing sandbox command 'podman'");
      });
    });

    describe('sandbox-exec command', () => {
      it('should use sandbox-exec on macOS', async () => {
        vi.mocked(os.platform).mockReturnValue('darwin');
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'sandbox-exec',
        );

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: true,
        });

        expect(result?.command).toBe('sandbox-exec');
      });

      it('should not use sandbox-exec on Linux', async () => {
        vi.mocked(os.platform).mockReturnValue('linux');
        vi.mocked(commandExists.sync).mockReturnValue(true);

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: true,
        });

        expect(result?.command).not.toBe('sandbox-exec');
      });

      it('should use sandbox-exec from argv', async () => {
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'sandbox-exec',
        );

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: 'sandbox-exec',
        });

        expect(result?.command).toBe('sandbox-exec');
      });

      it('should prefer sandbox-exec on macOS', async () => {
        vi.mocked(os.platform).mockReturnValue('darwin');
        vi.mocked(commandExists.sync).mockReturnValue(true);

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: true,
        });

        expect(result?.command).toBe('sandbox-exec');
      });

      it('should throw when sandbox-exec specified but not found', async () => {
        await expect(
          loadSandboxConfig(mockSettings, { sandbox: 'sandbox-exec' }),
        ).rejects.toThrow(FatalSandboxError);
      });
    });

    describe('invalid commands', () => {
      it('should throw for invalid command string', async () => {
        await expect(
          loadSandboxConfig(mockSettings, { sandbox: 'invalid' }),
        ).rejects.toThrow(FatalSandboxError);

        await expect(
          loadSandboxConfig(mockSettings, { sandbox: 'invalid' }),
        ).rejects.toThrow("Invalid sandbox command 'invalid'");
      });

      it('should throw for empty string command', async () => {
        await expect(
          loadSandboxConfig(mockSettings, { sandbox: '' }),
        ).rejects.toThrow(FatalSandboxError);
      });

      it('should list valid commands in error', async () => {
        await expect(
          loadSandboxConfig(mockSettings, { sandbox: 'bad-command' }),
        ).rejects.toThrow('docker, podman, sandbox-exec');
      });
    });

    describe('command priority', () => {
      it('should prioritize env over argv', async () => {
        process.env['GEMINI_SANDBOX'] = 'podman';
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'podman',
        );

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: 'docker',
        });

        expect(result?.command).toBe('podman');
      });

      it('should prioritize argv over settings', async () => {
        mockSettings.tools!.sandbox = 'podman';
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'docker',
        );

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: 'docker',
        });

        expect(result?.command).toBe('docker');
      });

      it('should use settings when argv not provided', async () => {
        mockSettings.tools!.sandbox = 'docker';
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'docker',
        );

        const result = await loadSandboxConfig(mockSettings, {});

        expect(result?.command).toBe('docker');
      });
    });

    describe('image configuration', () => {
      it('should use sandboxImage from argv', async () => {
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'docker',
        );

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: 'docker',
          sandboxImage: 'custom-image:v1',
        });

        expect(result?.image).toBe('custom-image:v1');
      });

      it('should use GEMINI_SANDBOX_IMAGE env', async () => {
        process.env['GEMINI_SANDBOX_IMAGE'] = 'env-image:latest';
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'docker',
        );

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: 'docker',
        });

        expect(result?.image).toBe('env-image:latest');
      });

      it('should use package.json config', async () => {
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'docker',
        );

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: 'docker',
        });

        expect(result?.image).toBe('default-image:latest');
      });

      it('should prioritize argv over env', async () => {
        process.env['GEMINI_SANDBOX_IMAGE'] = 'env-image:latest';
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'docker',
        );

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: 'docker',
          sandboxImage: 'argv-image:v2',
        });

        expect(result?.image).toBe('argv-image:v2');
      });

      it('should prioritize env over package.json', async () => {
        process.env['GEMINI_SANDBOX_IMAGE'] = 'env-image:latest';
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'docker',
        );

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: 'docker',
        });

        expect(result?.image).toBe('env-image:latest');
      });

      it('should return undefined when no image available', async () => {
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'docker',
        );
        vi.mocked(packageModule.getPackageJson).mockResolvedValue({} as never);

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: 'docker',
        });

        expect(result).toBeUndefined();
      });
    });

    describe('complete config', () => {
      it('should return both command and image', async () => {
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'docker',
        );

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: 'docker',
          sandboxImage: 'test-image:v1',
        });

        expect(result).toEqual({
          command: 'docker',
          image: 'test-image:v1',
        });
      });

      it('should require both command and image', async () => {
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'docker',
        );

        const withImage = await loadSandboxConfig(mockSettings, {
          sandbox: 'docker',
          sandboxImage: 'image:v1',
        });
        expect(withImage).toBeDefined();

        vi.mocked(packageModule.getPackageJson).mockResolvedValue({} as never);
        const withoutImage = await loadSandboxConfig(mockSettings, {
          sandbox: 'docker',
        });
        expect(withoutImage).toBeUndefined();
      });
    });

    describe('error handling', () => {
      it('should throw when sandbox=true but no command found', async () => {
        await expect(
          loadSandboxConfig(mockSettings, { sandbox: true }),
        ).rejects.toThrow(FatalSandboxError);

        await expect(
          loadSandboxConfig(mockSettings, { sandbox: true }),
        ).rejects.toThrow('failed to determine command for sandbox');
      });

      it('should throw FatalSandboxError type', async () => {
        await expect(
          loadSandboxConfig(mockSettings, { sandbox: 'invalid' }),
        ).rejects.toBeInstanceOf(FatalSandboxError);
      });

      it('should suggest installing docker or podman', async () => {
        await expect(
          loadSandboxConfig(mockSettings, { sandbox: true }),
        ).rejects.toThrow('install docker or podman');
      });
    });

    describe('platform detection', () => {
      it('should check platform for sandbox-exec', async () => {
        vi.mocked(os.platform).mockReturnValue('darwin');
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'sandbox-exec',
        );

        await loadSandboxConfig(mockSettings, { sandbox: true });

        expect(os.platform).toHaveBeenCalled();
      });

      it('should work on Windows', async () => {
        vi.mocked(os.platform).mockReturnValue('win32');
        vi.mocked(commandExists.sync).mockImplementation(
          (cmd) => cmd === 'docker',
        );

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: true,
        });

        expect(result?.command).toBe('docker');
      });
    });

    describe('SANDBOX env check', () => {
      it('should skip when SANDBOX env is set', async () => {
        process.env['SANDBOX'] = '1';
        vi.mocked(commandExists.sync).mockReturnValue(true);

        const result = await loadSandboxConfig(mockSettings, {
          sandbox: 'docker',
        });

        expect(result).toBeUndefined();
      });

      it('should not call commandExists when in sandbox', async () => {
        process.env['SANDBOX'] = 'true';

        await loadSandboxConfig(mockSettings, { sandbox: 'docker' });

        expect(commandExists.sync).not.toHaveBeenCalled();
      });
    });
  });
});
