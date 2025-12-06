/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { GitAiIntegrationService } from './gitAiIntegrationService.js';
import type { HookRegistry } from '../hooks/hookRegistry.js';
import { HookEventName, HookType } from '../hooks/types.js';
import { ConfigSource } from '../hooks/hookRegistry.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

/**
 * Helper to create a mock child process that emits events
 */
function createMockChildProcess(exitCode: number): ChildProcess {
  const emitter = new EventEmitter();
  // Simulate async close event
  setTimeout(() => {
    emitter.emit('close', exitCode);
  }, 0);
  return emitter as unknown as ChildProcess;
}

/**
 * Helper to create a mock child process that emits an error
 */
function createMockChildProcessWithError(): ChildProcess {
  const emitter = new EventEmitter();
  // Simulate async error event
  setTimeout(() => {
    emitter.emit('error', new Error('spawn error'));
  }, 0);
  return emitter as unknown as ChildProcess;
}

// Mock debugLogger using vi.hoisted
const mockDebugLogger = vi.hoisted(() => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: mockDebugLogger,
}));

describe('GitAiIntegrationService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockHookRegistry: any;
  let originalPlatform: NodeJS.Platform;

  beforeEach(() => {
    vi.resetAllMocks();
    originalPlatform = process.platform;

    mockHookRegistry = {
      addHookEntry: vi.fn().mockReturnValue(true),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  describe('constructor', () => {
    it('should create service with enabled=true by default', () => {
      const service = new GitAiIntegrationService();
      expect(service.getStatus().enabled).toBe(true);
    });

    it('should create service with enabled=false when specified', () => {
      const service = new GitAiIntegrationService(false);
      expect(service.getStatus().enabled).toBe(false);
    });

    it('should create service with enabled=true when specified', () => {
      const service = new GitAiIntegrationService(true);
      expect(service.getStatus().enabled).toBe(true);
    });
  });

  describe('initialize', () => {
    describe('when disabled', () => {
      it('should not register hooks when service is disabled', async () => {
        const service = new GitAiIntegrationService(false);

        await service.initialize(mockHookRegistry);

        expect(mockHookRegistry.addHookEntry).not.toHaveBeenCalled();
        expect(mockDebugLogger.debug).toHaveBeenCalledWith(
          'Git-AI integration is disabled',
        );
        expect(service.getStatus().registered).toBe(false);
      });

      it('should not check for git-ai availability when disabled', async () => {
        const service = new GitAiIntegrationService(false);

        await service.initialize(mockHookRegistry);

        expect(spawn).not.toHaveBeenCalled();
      });
    });

    describe('when enabled', () => {
      describe('git-ai not available', () => {
        it('should not register hooks when git-ai command is not found', async () => {
          const service = new GitAiIntegrationService(true);
          vi.mocked(spawn).mockReturnValue(createMockChildProcess(1)); // Exit code 1 = not found

          await service.initialize(mockHookRegistry);

          expect(mockHookRegistry.addHookEntry).not.toHaveBeenCalled();
          expect(mockDebugLogger.debug).toHaveBeenCalledWith(
            'git-ai command not found in PATH, skipping git-ai integration',
          );
          expect(service.getStatus().registered).toBe(false);
        });

        it('should use correct command for non-Windows platforms', async () => {
          Object.defineProperty(process, 'platform', { value: 'linux' });
          const service = new GitAiIntegrationService(true);
          vi.mocked(spawn).mockReturnValue(createMockChildProcess(1));

          await service.initialize(mockHookRegistry);

          expect(spawn).toHaveBeenCalledWith('command', ['-v', 'git-ai'], {
            stdio: 'ignore',
            shell: true,
          });
        });

        it('should use correct command for Windows platforms', async () => {
          Object.defineProperty(process, 'platform', { value: 'win32' });
          const service = new GitAiIntegrationService(true);
          vi.mocked(spawn).mockReturnValue(createMockChildProcess(1));

          await service.initialize(mockHookRegistry);

          expect(spawn).toHaveBeenCalledWith('where.exe', ['git-ai'], {
            stdio: 'ignore',
            shell: true,
          });
        });
      });

      describe('git-ai available', () => {
        beforeEach(() => {
          vi.mocked(spawn).mockReturnValue(createMockChildProcess(0)); // Exit code 0 = found
          mockHookRegistry.addHookEntry.mockReturnValue(true);
        });

        it('should register BeforeTool and AfterTool hooks when git-ai is available', async () => {
          const service = new GitAiIntegrationService(true);

          await service.initialize(mockHookRegistry);

          expect(mockHookRegistry.addHookEntry).toHaveBeenCalledTimes(2);
          expect(service.getStatus().registered).toBe(true);
          expect(mockDebugLogger.log).toHaveBeenCalledWith(
            'Git-AI integration initialized successfully',
          );
        });

        it('should register BeforeTool hook with correct configuration', async () => {
          const service = new GitAiIntegrationService(true);

          await service.initialize(mockHookRegistry);

          const calls = mockHookRegistry.addHookEntry.mock.calls as Array<
            [{ eventName: HookEventName }]
          >;
          const beforeToolCall = calls.find(
            (call) => call[0].eventName === HookEventName.BeforeTool,
          );

          expect(beforeToolCall).toBeDefined();
          expect(beforeToolCall![0]).toEqual({
            config: {
              type: HookType.Command,
              command: 'git-ai checkpoint gemini --hook-input stdin',
            },
            source: ConfigSource.Extensions,
            eventName: HookEventName.BeforeTool,
            matcher: 'write_file|replace',
            enabled: true,
          });
        });

        it('should register AfterTool hook with correct configuration', async () => {
          const service = new GitAiIntegrationService(true);

          await service.initialize(mockHookRegistry);

          const calls = mockHookRegistry.addHookEntry.mock.calls as Array<
            [{ eventName: HookEventName }]
          >;
          const afterToolCall = calls.find(
            (call) => call[0].eventName === HookEventName.AfterTool,
          );

          expect(afterToolCall).toBeDefined();
          expect(afterToolCall![0]).toEqual({
            config: {
              type: HookType.Command,
              command: 'git-ai checkpoint gemini --hook-input stdin',
            },
            source: ConfigSource.Extensions,
            eventName: HookEventName.AfterTool,
            matcher: 'write_file|replace',
            enabled: true,
          });
        });

        it('should log debug message when registering hooks', async () => {
          const service = new GitAiIntegrationService(true);

          await service.initialize(mockHookRegistry);

          expect(mockDebugLogger.debug).toHaveBeenCalledWith(
            'Registered git-ai hooks for BeforeTool and AfterTool events (matcher: write_file|replace)',
          );
        });

        it('should not register hooks multiple times on repeated initialization', async () => {
          const service = new GitAiIntegrationService(true);

          await service.initialize(mockHookRegistry);
          await service.initialize(mockHookRegistry);
          await service.initialize(mockHookRegistry);

          expect(mockHookRegistry.addHookEntry).toHaveBeenCalledTimes(2);
          expect(mockDebugLogger.debug).toHaveBeenCalledWith(
            'Git-AI hooks already registered',
          );
        });

        it('should mark as registered after first successful initialization', async () => {
          const service = new GitAiIntegrationService(true);

          expect(service.getStatus().registered).toBe(false);

          await service.initialize(mockHookRegistry);

          expect(service.getStatus().registered).toBe(true);
        });
      });
    });
  });

  describe('getStatus', () => {
    it('should return correct status when service is disabled', () => {
      const service = new GitAiIntegrationService(false);

      const status = service.getStatus();

      expect(status).toEqual({
        enabled: false,
        registered: false,
      });
    });

    it('should return correct status when service is enabled but not initialized', () => {
      const service = new GitAiIntegrationService(true);

      const status = service.getStatus();

      expect(status).toEqual({
        enabled: true,
        registered: false,
      });
    });

    it('should return correct status after successful initialization', async () => {
      const service = new GitAiIntegrationService(true);
      vi.mocked(spawn).mockReturnValue(createMockChildProcess(0));
      mockHookRegistry.addHookEntry.mockReturnValue(true);

      await service.initialize(mockHookRegistry as unknown as HookRegistry);

      const status = service.getStatus();

      expect(status).toEqual({
        enabled: true,
        registered: true,
      });
    });

    it('should return correct status after failed initialization (git-ai not found)', async () => {
      const service = new GitAiIntegrationService(true);
      vi.mocked(spawn).mockReturnValue(createMockChildProcess(1));

      await service.initialize(mockHookRegistry);

      const status = service.getStatus();

      expect(status).toEqual({
        enabled: true,
        registered: false,
      });
    });
  });

  describe('error handling', () => {
    it('should handle spawn errors gracefully', async () => {
      const service = new GitAiIntegrationService(true);
      vi.mocked(spawn).mockReturnValue(createMockChildProcessWithError());

      await expect(
        service.initialize(mockHookRegistry),
      ).resolves.not.toThrow();

      expect(mockHookRegistry.addHookEntry).not.toHaveBeenCalled();
      expect(service.getStatus().registered).toBe(false);
    });

    it('should handle spawn throwing synchronously', async () => {
      const service = new GitAiIntegrationService(true);
      vi.mocked(spawn).mockImplementation(() => {
        throw new Error('Spawn failed');
      });

      await expect(
        service.initialize(mockHookRegistry),
      ).resolves.not.toThrow();

      expect(mockHookRegistry.addHookEntry).not.toHaveBeenCalled();
      expect(service.getStatus().registered).toBe(false);
    });
  });

  describe('platform-specific behavior', () => {
    const platforms: Array<{
      platform: NodeJS.Platform;
      command: string;
      args: string[];
    }> = [
      { platform: 'linux', command: 'command', args: ['-v', 'git-ai'] },
      { platform: 'darwin', command: 'command', args: ['-v', 'git-ai'] },
      { platform: 'win32', command: 'where.exe', args: ['git-ai'] },
    ];

    for (const { platform, command, args } of platforms) {
      it(`should use correct command check for ${platform}`, async () => {
        Object.defineProperty(process, 'platform', { value: platform });
        const service = new GitAiIntegrationService(true);
        vi.mocked(spawn).mockReturnValue(createMockChildProcess(0));
        mockHookRegistry.addHookEntry.mockReturnValue(true);

        await service.initialize(mockHookRegistry as unknown as HookRegistry);

        expect(spawn).toHaveBeenCalledWith(command, args, {
          stdio: 'ignore',
          shell: true,
        });
      });
    }
  });
});

