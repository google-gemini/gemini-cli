/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exec } from 'node:child_process';
import { GitAiIntegrationService } from './gitAiIntegrationService.js';
import type { HookRegistry } from '../hooks/hookRegistry.js';
import { HookEventName, HookType } from '../hooks/types.js';
import { ConfigSource } from '../hooks/hookRegistry.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

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

/**
 * Helper to mock exec for successful git-ai version check
 */
function mockExecSuccess() {
  vi.mocked(exec).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_command: string, callback: any) => {
      // exec callback signature: (error, stdout, stderr)
      if (typeof callback === 'function') {
        callback(null, 'git-ai version 1.0.0', '');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return {} as any;
    },
  );
}

/**
 * Helper to mock exec for failed git-ai version check (command not found)
 */
function mockExecFailure() {
  vi.mocked(exec).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_command: string, callback: any) => {
      if (typeof callback === 'function') {
        const error = new Error('Command not found: git-ai');
        callback(error, '', '');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return {} as any;
    },
  );
}

describe('GitAiIntegrationService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockHookRegistry: any;

  beforeEach(() => {
    vi.resetAllMocks();

    mockHookRegistry = {
      addHookEntry: vi.fn().mockReturnValue(true),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

        expect(exec).not.toHaveBeenCalled();
      });
    });

    describe('when enabled', () => {
      describe('git-ai not available', () => {
        it('should not register hooks when git-ai command is not found', async () => {
          const service = new GitAiIntegrationService(true);
          mockExecFailure();

          await service.initialize(mockHookRegistry);

          expect(mockHookRegistry.addHookEntry).not.toHaveBeenCalled();
          expect(mockDebugLogger.debug).toHaveBeenCalledWith(
            'git-ai command not found in PATH, skipping git-ai integration',
          );
          expect(service.getStatus().registered).toBe(false);
        });

        it('should call git-ai version to check availability', async () => {
          const service = new GitAiIntegrationService(true);
          mockExecFailure();

          await service.initialize(mockHookRegistry);

          expect(exec).toHaveBeenCalledWith(
            'git-ai version',
            expect.any(Function),
          );
        });
      });

      describe('git-ai available', () => {
        beforeEach(() => {
          mockExecSuccess();
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
      mockExecSuccess();
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
      mockExecFailure();

      await service.initialize(mockHookRegistry);

      const status = service.getStatus();

      expect(status).toEqual({
        enabled: true,
        registered: false,
      });
    });
  });

  describe('error handling', () => {
    it('should handle exec errors gracefully', async () => {
      const service = new GitAiIntegrationService(true);
      mockExecFailure();

      await expect(service.initialize(mockHookRegistry)).resolves.not.toThrow();

      expect(mockHookRegistry.addHookEntry).not.toHaveBeenCalled();
      expect(service.getStatus().registered).toBe(false);
    });

    it('should handle exec throwing synchronously', async () => {
      const service = new GitAiIntegrationService(true);
      vi.mocked(exec).mockImplementation(() => {
        throw new Error('exec failed');
      });

      await expect(service.initialize(mockHookRegistry)).resolves.not.toThrow();

      expect(mockHookRegistry.addHookEntry).not.toHaveBeenCalled();
      expect(service.getStatus().registered).toBe(false);
    });
  });

  describe('isGitAiAvailable', () => {
    it('should return true when git-ai version succeeds', async () => {
      const service = new GitAiIntegrationService(true);
      mockExecSuccess();

      await service.initialize(mockHookRegistry);

      expect(exec).toHaveBeenCalledWith('git-ai version', expect.any(Function));
      expect(service.getStatus().registered).toBe(true);
    });

    it('should return false when git-ai version fails', async () => {
      const service = new GitAiIntegrationService(true);
      mockExecFailure();

      await service.initialize(mockHookRegistry);

      expect(exec).toHaveBeenCalledWith('git-ai version', expect.any(Function));
      expect(service.getStatus().registered).toBe(false);
    });
  });
});
