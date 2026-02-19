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

describe('EnterPlanModeTool', () => {
  let tool: EnterPlanModeTool;
  let mockMessageBus: ReturnType<typeof createMockMessageBus>;
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    mockMessageBus = createMockMessageBus();
    vi.mocked(mockMessageBus.publish).mockResolvedValue(undefined);

    mockConfig = {
      setApprovalMode: vi.fn(),
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
      ).mockResolvedValue('ASK_USER');

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
      ).mockResolvedValue('ALLOW');

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
      ).mockResolvedValue('DENY');

      await expect(
        invocation.shouldConfirmExecute(new AbortController().signal),
      ).rejects.toThrow(/denied by policy/);
    });
  });

  describe('execute', () => {
    it('should set approval mode to PLAN and return message', async () => {
      const invocation = tool.build({});

      const result = await invocation.execute(new AbortController().signal);

      expect(mockConfig.setApprovalMode).toHaveBeenCalledWith(
        ApprovalMode.PLAN,
      );
      expect(result.llmContent).toContain('Switching to Plan mode');
      expect(result.returnDisplay).toBe('Switching to Plan mode');
    });

    it('should include optional reason in output display but not in llmContent', async () => {
      const reason = 'Design new database schema';
      const invocation = tool.build({ reason });

      const result = await invocation.execute(new AbortController().signal);

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
      ).mockResolvedValue('ASK_USER');

      const details = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(details).not.toBe(false);

      if (details) {
        // Simulate user cancelling
        await details.onConfirm(ToolConfirmationOutcome.Cancel);
      }

      const result = await invocation.execute(new AbortController().signal);

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
