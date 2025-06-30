/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('command-exists', () => ({
  default: {
    sync: vi.fn(),
  },
}));

vi.mock('../utils/package.js', () => ({
  getPackageJson: vi.fn(),
}));

const mockCommandExists = (await import('command-exists')).default;
const mockGetPackageJson = (await import('../utils/package.js')).getPackageJson;

describe('Sandbox Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalPlatform: string;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = process.env;
    originalPlatform = process.platform;
    process.env = { ...originalEnv };

    // Mock basic package.json
    vi.mocked(mockGetPackageJson).mockResolvedValue({
      config: {
        sandboxImageUri: 'test-image:latest',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  describe('loadSandboxConfig', () => {
    it('should return undefined when sandbox is disabled', async () => {
      const { loadSandboxConfig } = await import('./sandboxConfig');
      const settings = { sandbox: false };
      const argv = {};

      const config = await loadSandboxConfig(settings, argv);
      expect(config).toBeUndefined();
    });

    it('should return undefined when already inside sandbox', async () => {
      process.env.SANDBOX = 'docker';

      const { loadSandboxConfig } = await import('./sandboxConfig');
      const settings = { sandbox: true };
      const argv = {};

      const config = await loadSandboxConfig(settings, argv);
      expect(config).toBeUndefined();
    });

    it('should use environment variable for sandbox command', async () => {
      process.env.GEMINI_SANDBOX = 'docker';
      vi.mocked(mockCommandExists.sync).mockReturnValue(true);

      const { loadSandboxConfig } = await import('./sandboxConfig');
      const settings = {};
      const argv = {};

      const config = await loadSandboxConfig(settings, argv);
      expect(config).toEqual({
        command: 'docker',
        image: 'test-image:latest',
      });
    });

    it('should use argv sandbox option', async () => {
      vi.mocked(mockCommandExists.sync).mockReturnValue(true);

      const { loadSandboxConfig } = await import('./sandboxConfig');
      const settings = {};
      const argv = { sandbox: 'podman' };

      const config = await loadSandboxConfig(settings, argv);
      expect(config).toEqual({
        command: 'podman',
        image: 'test-image:latest',
      });
    });

    it('should use settings sandbox option when argv not provided', async () => {
      vi.mocked(mockCommandExists.sync).mockReturnValue(true);

      const { loadSandboxConfig } = await import('./sandboxConfig');
      const settings = { sandbox: 'docker' };
      const argv = {};

      const config = await loadSandboxConfig(settings, argv);
      expect(config).toEqual({
        command: 'docker',
        image: 'test-image:latest',
      });
    });

    it('should prefer environment over argv and settings', async () => {
      process.env.GEMINI_SANDBOX = 'podman';
      vi.mocked(mockCommandExists.sync).mockReturnValue(true);

      const { loadSandboxConfig } = await import('./sandboxConfig');
      const settings = { sandbox: 'docker' };
      const argv = { sandbox: 'docker' };

      const config = await loadSandboxConfig(settings, argv);
      expect(config).toEqual({
        command: 'podman',
        image: 'test-image:latest',
      });
    });

    it('should auto-detect sandbox-exec on macOS', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });
      vi.mocked(mockCommandExists.sync).mockImplementation(
        (cmd) => cmd === 'sandbox-exec',
      );

      const { loadSandboxConfig } = await import('./sandboxConfig');
      const settings = { sandbox: true };
      const argv = {};

      const config = await loadSandboxConfig(settings, argv);
      expect(config).toEqual({
        command: 'sandbox-exec',
        image: 'test-image:latest',
      });
    });

    it('should auto-detect docker when sandbox is true', async () => {
      vi.mocked(mockCommandExists.sync).mockImplementation(
        (cmd) => cmd === 'docker',
      );

      const { loadSandboxConfig } = await import('./sandboxConfig');
      const settings = { sandbox: true };
      const argv = {};

      const config = await loadSandboxConfig(settings, argv);
      expect(config).toEqual({
        command: 'docker',
        image: 'test-image:latest',
      });
    });

    it('should auto-detect podman when docker not available', async () => {
      vi.mocked(mockCommandExists.sync).mockImplementation(
        (cmd) => cmd === 'podman',
      );

      const { loadSandboxConfig } = await import('./sandboxConfig');
      const settings = { sandbox: true };
      const argv = {};

      const config = await loadSandboxConfig(settings, argv);
      expect(config).toEqual({
        command: 'podman',
        image: 'test-image:latest',
      });
    });

    it('should use custom sandbox image from argv', async () => {
      vi.mocked(mockCommandExists.sync).mockReturnValue(true);

      const { loadSandboxConfig } = await import('./sandboxConfig');
      const settings = { sandbox: 'docker' };
      const argv = { 'sandbox-image': 'custom-image:v1' };

      const config = await loadSandboxConfig(settings, argv);
      expect(config).toEqual({
        command: 'docker',
        image: 'custom-image:v1',
      });
    });

    it('should use sandbox image from environment', async () => {
      process.env.GEMINI_SANDBOX_IMAGE = 'env-image:latest';
      vi.mocked(mockCommandExists.sync).mockReturnValue(true);

      const { loadSandboxConfig } = await import('./sandboxConfig');
      const settings = { sandbox: 'docker' };
      const argv = {};

      const config = await loadSandboxConfig(settings, argv);
      expect(config).toEqual({
        command: 'docker',
        image: 'env-image:latest',
      });
    });

    it('should return undefined when no image is available', async () => {
      vi.mocked(mockCommandExists.sync).mockReturnValue(true);
      vi.mocked(mockGetPackageJson).mockResolvedValue({});

      const { loadSandboxConfig } = await import('./sandboxConfig');
      const settings = { sandbox: 'docker' };
      const argv = {};

      const config = await loadSandboxConfig(settings, argv);
      expect(config).toBeUndefined();
    });

    it('should handle string boolean values', async () => {
      vi.mocked(mockCommandExists.sync).mockImplementation(
        (cmd) => cmd === 'docker',
      );

      const { loadSandboxConfig } = await import('./sandboxConfig');
      const settings = { sandbox: 'true' };
      const argv = {};

      const config = await loadSandboxConfig(settings, argv);
      expect(config).toEqual({
        command: 'docker',
        image: 'test-image:latest',
      });
    });

    it('should handle numeric boolean values', async () => {
      vi.mocked(mockCommandExists.sync).mockImplementation(
        (cmd) => cmd === 'docker',
      );

      const { loadSandboxConfig } = await import('./sandboxConfig');
      const settings = { sandbox: '1' };
      const argv = {};

      const config = await loadSandboxConfig(settings, argv);
      expect(config).toEqual({
        command: 'docker',
        image: 'test-image:latest',
      });
    });

    it('should handle false string values', async () => {
      const { loadSandboxConfig } = await import('./sandboxConfig');
      const settings = { sandbox: 'false' };
      const argv = {};

      const config = await loadSandboxConfig(settings, argv);
      expect(config).toBeUndefined();
    });

    it('should handle zero string values', async () => {
      const { loadSandboxConfig } = await import('./sandboxConfig');
      const settings = { sandbox: '0' };
      const argv = {};

      const config = await loadSandboxConfig(settings, argv);
      expect(config).toBeUndefined();
    });
  });
});
