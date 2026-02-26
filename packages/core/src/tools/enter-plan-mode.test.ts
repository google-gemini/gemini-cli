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
import { SubagentToolWrapper } from '../agents/subagent-tool-wrapper.js';
import type { LocalAgentDefinition } from '../agents/types.js';

vi.mock('../agents/subagent-tool-wrapper.js');

describe('EnterPlanModeTool', () => {
  let tool: EnterPlanModeTool;
  let mockMessageBus: ReturnType<typeof createMockMessageBus>;
  let mockConfig: Config;
  let mockPlannerDefinition: LocalAgentDefinition;

  beforeEach(() => {
    mockMessageBus = createMockMessageBus();
    vi.mocked(mockMessageBus.publish).mockResolvedValue(undefined);

    mockPlannerDefinition = {
      kind: 'local',
      name: 'planner',
      description: 'Mock Planner',
      inputConfig: { inputSchema: {} },
    } as LocalAgentDefinition;

    mockConfig = {
      setApprovalMode: vi.fn(),
      isPlannerSubagentEnabled: vi.fn().mockReturnValue(true),
      getAgentRegistry: vi.fn().mockReturnValue({
        getDefinition: vi.fn().mockReturnValue(mockPlannerDefinition),
      }),
      storage: {
        getPlansDir: vi.fn().mockReturnValue('/mock/plans/dir'),
      } as unknown as Config['storage'],
    } as unknown as Config;
    tool = new EnterPlanModeTool(
      mockConfig,
      mockMessageBus as unknown as MessageBus,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('shouldConfirmExecute', () => {
    it('should return info confirmation details when policy says ASK_USER', async () => {
      const invocation = tool.build({});

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
  });

  describe('execute', () => {
    it('should delegate to planner subagent', async () => {
      const invocation = tool.build({ reason: 'test reason' });

      const mockSubInvocation = {
        execute: vi.fn().mockResolvedValue({
          llmContent: 'Plan created.',
          returnDisplay: 'Plan Display',
        }),
      };

      vi.mocked(SubagentToolWrapper).prototype.build = vi
        .fn()
        .mockReturnValue(mockSubInvocation);

      const result = await invocation.execute(new AbortController().signal);

      expect(mockConfig.getAgentRegistry().getDefinition).toHaveBeenCalledWith(
        'planner',
      );
      expect(SubagentToolWrapper).toHaveBeenCalledWith(
        mockPlannerDefinition,
        mockConfig,
        mockMessageBus,
      );
      expect(mockSubInvocation.execute).toHaveBeenCalled();
      expect(result.llmContent).toBe('Plan created.');
      expect(result.returnDisplay).toBe('Plan Display');
    });

    it('should not enter plan mode if cancelled', async () => {
      const invocation = tool.build({});

      vi.spyOn(
        invocation as unknown as {
          getMessageBusDecision: () => Promise<string>;
        },
        'getMessageBusDecision',
      ).mockResolvedValue('ASK_USER');

      const details = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      if (details) {
        await details.onConfirm(ToolConfirmationOutcome.Cancel);
      }

      const result = await invocation.execute(new AbortController().signal);

      expect(result.returnDisplay).toBe('Cancelled');
      expect(result.llmContent).toContain('User cancelled');
    });
  });
});
