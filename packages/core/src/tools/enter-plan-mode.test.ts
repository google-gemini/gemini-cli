/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnterPlanModeTool } from './enter-plan-mode.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { ToolConfirmationOutcome } from './tools.js';
import { ApprovalMode } from '../policy/types.js';
import fs from 'node:fs';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    default: {
      // @ts-expect-error - Property 'default' does not exist on type 'typeof import("node:fs")'
      ...actual.default,
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

describe('EnterPlanModeTool', () => {
  let tool: EnterPlanModeTool;
  let mockMessageBus: ReturnType<typeof createMockMessageBus>;
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    mockMessageBus = createMockMessageBus();
    vi.mocked(mockMessageBus.publish).mockResolvedValue(undefined);

    mockConfig = {
      setApprovalMode: vi.fn(),
      getExtensions: vi.fn().mockReturnValue([]),
      getExtensionSetting: vi.fn(),
      storage: {
        getPlansDir: vi.fn().mockReturnValue('/mock/plans/dir'),
      } as unknown as Config['storage'],
    };
    tool = new EnterPlanModeTool(
      mockConfig as Config,
      mockMessageBus as unknown as MessageBus,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('shouldConfirmExecute', () => {
    it('should return info confirmation details when policy says ASK_USER', async () => {
      const invocation = tool.build({});

      // Mock getMessageBusDecision to return ASK_USER
      vi.spyOn(
        invocation as unknown as {
          getMessageBusDecision: () => Promise<string>;
        },
        'getMessageBusDecision',
      ).mockResolvedValue('ask_user');

      const result = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(result).not.toBe(false);
      if (result === false) return;

      expect(result.type).toBe('info');
      expect(result.title).toBe('Enter Plan Mode');
      if (result.type === 'info') {
        expect(result.prompt).toBe(
          'This will restrict the agent to read-only tools to allow for safe planning.',
        );
      }
    });

    it('should return false when policy decision is ALLOW', async () => {
      const invocation = tool.build({});

      // Mock getMessageBusDecision to return ALLOW
      vi.spyOn(
        invocation as unknown as {
          getMessageBusDecision: () => Promise<string>;
        },
        'getMessageBusDecision',
      ).mockResolvedValue('allow');

      const result = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(result).toBe(false);
    });

    it('should throw error when policy decision is DENY', async () => {
      const invocation = tool.build({});

      // Mock getMessageBusDecision to return DENY
      vi.spyOn(
        invocation as unknown as {
          getMessageBusDecision: () => Promise<string>;
        },
        'getMessageBusDecision',
      ).mockResolvedValue('deny');

      await expect(
        invocation.shouldConfirmExecute(new AbortController().signal),
      ).rejects.toThrow(/denied by policy/);
    });
  });

  describe('execute', () => {
    it('should set approval mode to PLAN and return message', async () => {
      const invocation = tool.build({});
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(mockConfig.setApprovalMode).toHaveBeenCalledWith(
        ApprovalMode.PLAN,
      );
      expect(result.llmContent).toContain('Switching to Plan mode');
      expect(result.returnDisplay).toBe('Switching to Plan mode');
    });

    it('should create custom plan directories for active extensions, handling overrides and fallbacks', async () => {
      vi.mocked(mockConfig.getExtensions!).mockReturnValue([
        {
          id: 'ext-user-override-id',
          name: 'ext-user-override',
          isActive: true,
          plan: { directory: '.manifest-dir' }, // Manifest default exists
        } as import('../config/config.js').GeminiCLIExtension,
        {
          id: 'ext-manifest-fallback-id',
          name: 'ext-manifest-fallback',
          isActive: true,
          plan: { directory: '.manifest-dir' }, // Only manifest default
        } as import('../config/config.js').GeminiCLIExtension,
        {
          id: 'ext-no-custom-id',
          name: 'ext-no-custom',
          isActive: true,
        } as import('../config/config.js').GeminiCLIExtension,
        {
          id: 'ext-inactive-id',
          name: 'ext-inactive',
          isActive: false,
          plan: { directory: '.inactive-dir' },
        } as import('../config/config.js').GeminiCLIExtension,
      ]);

      vi.mocked(mockConfig.getExtensionSetting!).mockImplementation(
        (id, setting) => {
          if (id === 'ext-user-override-id' && setting === 'plan.directory') {
            return '.user-override-dir'; // User setting wins
          }
          return undefined;
        },
      );

      vi.mocked(mockConfig.storage!.getPlansDir).mockImplementation(
        (customDir?: string) => {
          if (customDir === '.user-override-dir')
            return '/mock/plans/user-override';
          if (customDir === '.manifest-dir')
            return '/mock/plans/manifest-default';
          return '/mock/plans/global-default';
        },
      );

      const invocation = tool.build({});
      await invocation.execute({ abortSignal: new AbortController().signal });

      // 1. Global default should be created
      expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/plans/global-default', {
        recursive: true,
      });
      // 2. User override should be created for ext-user-override
      expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/plans/user-override', {
        recursive: true,
      });
      // 3. Manifest default should be created for ext-manifest-fallback
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        '/mock/plans/manifest-default',
        {
          recursive: true,
        },
      );
      // 4. No folder should be created for ext-no-custom
      // 5. No folder should be created for ext-inactive
      expect(fs.mkdirSync).not.toHaveBeenCalledWith(
        '/mock/plans/inactive-dir',
        {
          recursive: true,
        },
      );

      expect(fs.mkdirSync).toHaveBeenCalledTimes(3);
    });

    it('should ignore validation failures for extension-specific plan directories and continue', async () => {
      vi.mocked(mockConfig.getExtensions!).mockReturnValue([
        {
          name: 'ext-invalid',
          isActive: true,
          plan: { directory: '../illegal' },
        } as import('../config/config.js').GeminiCLIExtension,
        {
          name: 'ext-valid',
          isActive: true,
          plan: { directory: '.valid' },
        } as import('../config/config.js').GeminiCLIExtension,
      ]);

      vi.mocked(mockConfig.storage!.getPlansDir).mockImplementation(
        (customDir?: string) => {
          if (customDir === '../illegal')
            throw new Error('Path traversal detected');
          if (customDir === '.valid') return '/mock/plans/valid';
          return '/mock/plans/global-default';
        },
      );

      const invocation = tool.build({});
      await invocation.execute({ abortSignal: new AbortController().signal });

      // Should create global default
      expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/plans/global-default', {
        recursive: true,
      });
      // Should create valid extension dir
      expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/plans/valid', {
        recursive: true,
      });
      // Should NOT have crashed on illegal dir
      expect(fs.mkdirSync).toHaveBeenCalledTimes(2);
    });

    it('should include optional reason in output display but not in llmContent', async () => {
      const reason = 'Design new database schema';
      const invocation = tool.build({ reason });
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(mockConfig.setApprovalMode).toHaveBeenCalledWith(
        ApprovalMode.PLAN,
      );
      expect(result.llmContent).toBe('Switching to Plan mode.');
      expect(result.llmContent).not.toContain(reason);
      expect(result.returnDisplay).toContain(reason);
    });

    it('should not enter plan mode if cancelled', async () => {
      const invocation = tool.build({});

      // Simulate getting confirmation details
      vi.spyOn(
        invocation as unknown as {
          getMessageBusDecision: () => Promise<string>;
        },
        'getMessageBusDecision',
      ).mockResolvedValue('ask_user');

      const details = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(details).not.toBe(false);

      if (details) {
        // Simulate user cancelling
        await details.onConfirm(ToolConfirmationOutcome.Cancel);
      }

      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(mockConfig.setApprovalMode).not.toHaveBeenCalled();
      expect(result.returnDisplay).toBe('Cancelled');
      expect(result.llmContent).toContain('User cancelled');
    });
  });

  describe('validateToolParams', () => {
    it('should allow empty params', () => {
      const result = tool.validateToolParams({});
      expect(result).toBeNull();
    });

    it('should allow reason param', () => {
      const result = tool.validateToolParams({ reason: 'test' });
      expect(result).toBeNull();
    });
  });
});
