/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exec } from 'child_process';

// Mock dependencies
vi.mock('child_process');

const mockExec = vi.mocked(exec);

// Mock environment variables
const mockEnv = {
  GEMINI_SANDBOX: 'docker',
  DOCKER_HOST: 'unix:///var/run/docker.sock'
};

vi.stubGlobal('process', {
  env: mockEnv,
  platform: 'linux'
});

describe('Sandbox Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sandbox type detection', () => {
    it('should detect docker sandbox from environment', async () => {
      mockEnv.GEMINI_SANDBOX = 'docker';
      
      const { getSandboxType } = await import('./sandboxConfig');
      const sandboxType = getSandboxType();
      
      expect(sandboxType).toBe('docker');
    });

    it('should detect podman sandbox from environment', async () => {
      mockEnv.GEMINI_SANDBOX = 'podman';
      
      const { getSandboxType } = await import('./sandboxConfig');
      const sandboxType = getSandboxType();
      
      expect(sandboxType).toBe('podman');
    });

    it('should default to none when not specified', async () => {
      mockEnv.GEMINI_SANDBOX = '';
      
      const { getSandboxType } = await import('./sandboxConfig');
      const sandboxType = getSandboxType();
      
      expect(sandboxType).toBe('none');
    });

    it('should handle invalid sandbox type', async () => {
      mockEnv.GEMINI_SANDBOX = 'invalid-container-runtime';
      
      const { getSandboxType } = await import('./sandboxConfig');
      const sandboxType = getSandboxType();
      
      expect(sandboxType).toBe('none');
    });

    it('should auto-detect available sandbox', async () => {
      mockEnv.GEMINI_SANDBOX = 'auto';
      
      // Mock docker available
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('docker --version')) {
          callback(null, 'Docker version 20.10.0', '');
        } else {
          callback(new Error('Command not found'), '', 'command not found');
        }
      });
      
      const { getSandboxType } = await import('./sandboxConfig');
      const sandboxType = getSandboxType();
      
      expect(sandboxType).toBe('docker');
    });
  });

  describe('sandbox configuration', () => {
    it('should provide docker configuration', async () => {
      const { getDockerConfig } = await import('./sandboxConfig');
      const config = getDockerConfig();
      
      expect(config).toMatchObject({
        image: expect.any(String),
        options: expect.arrayContaining([
          expect.stringContaining('--rm'),
          expect.stringContaining('--network=none')
        ]),
        workDir: expect.any(String),
        user: expect.any(String)
      });
    });

    it('should provide podman configuration', async () => {
      const { getPodmanConfig } = await import('./sandboxConfig');
      const config = getPodmanConfig();
      
      expect(config).toMatchObject({
        image: expect.any(String),
        options: expect.arrayContaining([
          expect.stringContaining('--rm'),
          expect.stringContaining('--network=none')
        ]),
        workDir: expect.any(String),
        user: expect.any(String)
      });
    });

    it('should validate sandbox availability', async () => {
      const { isSandboxAvailable } = await import('./sandboxConfig');
      
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('docker --version')) {
          callback(null, 'Docker version 20.10.0', '');
        } else {
          callback(new Error('Command not found'), '', '');
        }
      });
      
      const dockerAvailable = await isSandboxAvailable('docker');
      expect(dockerAvailable).toBe(true);
      
      const podmanAvailable = await isSandboxAvailable('podman');
      expect(podmanAvailable).toBe(false);
    });

    it('should handle sandbox command execution timeout', async () => {
      const { isSandboxAvailable } = await import('./sandboxConfig');
      
      mockExec.mockImplementation((command, callback) => {
        // Simulate timeout - never call callback
      });
      
      const available = await isSandboxAvailable('docker');
      expect(available).toBe(false);
    });
  });

  describe('sandbox security', () => {
    it('should provide security constraints', async () => {
      const { getSecurityConstraints } = await import('./sandboxConfig');
      const constraints = getSecurityConstraints();
      
      expect(constraints).toMatchObject({
        allowNetworking: false,
        allowFileSystem: false,
        timeoutSeconds: expect.any(Number),
        maxMemoryMB: expect.any(Number),
        maxCpuPercent: expect.any(Number),
        allowedMounts: expect.any(Array),
        blockedPorts: expect.any(Array)
      });
    });

    it('should validate sandbox permissions', async () => {
      const { validateSandboxPermissions } = await import('./sandboxConfig');
      
      const validPermissions = {
        read: ['/tmp'],
        write: ['/tmp/output'],
        network: false,
        ports: []
      };
      
      const invalidPermissions = {
        read: ['/etc/passwd'],
        write: ['/'],
        network: true,
        ports: [22, 80]
      };
      
      expect(validateSandboxPermissions(validPermissions)).toBe(true);
      expect(validateSandboxPermissions(invalidPermissions)).toBe(false);
    });

    it('should prevent dangerous mount points', async () => {
      const { validateSandboxPermissions } = await import('./sandboxConfig');
      
      const dangerousPermissions = {
        read: ['/proc', '/sys', '/dev'],
        write: ['/boot'],
        network: false,
        ports: []
      };
      
      expect(validateSandboxPermissions(dangerousPermissions)).toBe(false);
    });

    it('should enforce resource limits', async () => {
      const { getResourceLimits } = await import('./sandboxConfig');
      const limits = getResourceLimits();
      
      expect(limits).toMatchObject({
        memory: expect.stringMatching(/^\d+[mg]$/i),
        cpu: expect.stringMatching(/^\d+\.?\d*$/),
        timeout: expect.any(Number),
        processes: expect.any(Number)
      });
    });
  });

  describe('sandbox lifecycle', () => {
    it('should create sandbox container', async () => {
      const { createSandbox } = await import('./sandboxConfig');
      
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('docker run')) {
          callback(null, 'container-id-123', '');
        }
      });
      
      const containerId = await createSandbox('test-image');
      expect(containerId).toBe('container-id-123');
    });

    it('should cleanup sandbox container', async () => {
      const { cleanupSandbox } = await import('./sandboxConfig');
      
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('docker rm')) {
          callback(null, 'container-id-123', '');
        }
      });
      
      await expect(cleanupSandbox('container-id-123')).resolves.toBeUndefined();
    });

    it('should handle sandbox creation errors', async () => {
      const { createSandbox } = await import('./sandboxConfig');
      
      mockExec.mockImplementation((command, callback) => {
        callback(new Error('Image not found'), '', 'Error: No such image');
      });
      
      await expect(createSandbox('nonexistent-image')).rejects.toThrow('Image not found');
    });
  });
});