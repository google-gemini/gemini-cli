/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExitPlanModeTool } from './exit-plan-mode.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import {
  MessageBusType,
  type PlanApprovalRequest,
} from '../confirmation-bus/types.js';
import path from 'node:path';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

describe('ExitPlanModeTool', () => {
  let tool: ExitPlanModeTool;
  let mockMessageBus: ReturnType<typeof createMockMessageBus>;
  let mockConfig: Partial<Config>;

  const mockTargetDir = path.resolve('/mock/dir');
  const mockPlansDir = path.resolve('/mock/dir/plans');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    mockMessageBus = createMockMessageBus();
    vi.mocked(mockMessageBus.publish).mockResolvedValue(undefined);
    mockConfig = {
      getTargetDir: vi.fn().mockReturnValue(mockTargetDir),
      storage: {
        getProjectTempPlansDir: vi.fn().mockReturnValue(mockPlansDir),
      } as unknown as Config['storage'],
    };
    tool = new ExitPlanModeTool(
      mockConfig as Config,
      mockMessageBus as unknown as MessageBus,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should publish PLAN_APPROVAL_REQUEST and resolve on approval', async () => {
    const planPath = 'plans/test-plan.md';

    const invocation = tool.build({ plan_path: planPath });
    const executionPromise = invocation.execute(new AbortController().signal);

    await vi.runAllTimersAsync();

    expect(mockMessageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.PLAN_APPROVAL_REQUEST,
        planPath: path.resolve(mockPlansDir, 'test-plan.md'),
      }),
    );

    const requestCall = vi
      .mocked(mockMessageBus.publish)
      .mock.calls.find(
        (call) => call[0].type === MessageBusType.PLAN_APPROVAL_REQUEST,
      );
    const correlationId = (requestCall![0] as PlanApprovalRequest)
      .correlationId;

    const handler = vi
      .mocked(mockMessageBus.subscribe)
      .mock.calls.find(
        (call) => call[0] === MessageBusType.PLAN_APPROVAL_RESPONSE,
      )?.[1];

    if (!handler) throw new Error('No subscription handler found');

    handler({
      type: MessageBusType.PLAN_APPROVAL_RESPONSE,
      correlationId,
      approved: true,
    });

    const result = await executionPromise;
    const expectedPath = path.resolve(mockPlansDir, 'test-plan.md');
    expect(result).toEqual({
      llmContent: `Plan approved. Switching to Default mode.

The approved implementation plan is stored at: ${expectedPath}
Read and follow the plan strictly during implementation.`,
      returnDisplay: `Plan approved: ${expectedPath}`,
    });
  });

  it('should resolve with feedback on rejection', async () => {
    const planPath = 'plans/test-plan.md';

    const invocation = tool.build({ plan_path: planPath });
    const executionPromise = invocation.execute(new AbortController().signal);

    await vi.runAllTimersAsync();

    const requestCall = vi
      .mocked(mockMessageBus.publish)
      .mock.calls.find(
        (call) => call[0].type === MessageBusType.PLAN_APPROVAL_REQUEST,
      );
    const correlationId = (requestCall![0] as PlanApprovalRequest)
      .correlationId;

    const handler = vi
      .mocked(mockMessageBus.subscribe)
      .mock.calls.find(
        (call) => call[0] === MessageBusType.PLAN_APPROVAL_RESPONSE,
      )?.[1];

    if (!handler) throw new Error('No subscription handler found');

    handler({
      type: MessageBusType.PLAN_APPROVAL_RESPONSE,
      correlationId,
      approved: false,
      feedback: 'Please add more details.',
    });

    const result = await executionPromise;
    const expectedPath = path.resolve(mockPlansDir, 'test-plan.md');
    expect(result).toEqual({
      llmContent: `Plan rejected. Feedback: Please add more details.

The plan is stored at: ${expectedPath}
Revise the plan based on the feedback.`,
      returnDisplay: 'Feedback: Please add more details.',
    });
  });

  it('should resolve with cancellation message when aborted', async () => {
    const planPath = 'plans/test-plan.md';

    const invocation = tool.build({ plan_path: planPath });

    const abortController = new AbortController();
    const executionPromise = invocation.execute(abortController.signal);

    await vi.runAllTimersAsync();

    abortController.abort();

    const result = await executionPromise;
    expect(result).toEqual({
      llmContent:
        'User cancelled the plan approval dialog. The plan was not approved and you are still in Plan Mode.',
      returnDisplay: 'Cancelled',
    });
  });

  it('should resolve immediately if signal is already aborted', async () => {
    const planPath = 'plans/test-plan.md';

    const invocation = tool.build({ plan_path: planPath });

    const abortController = new AbortController();
    abortController.abort();

    const result = await invocation.execute(abortController.signal);
    expect(result).toEqual({
      llmContent:
        'User cancelled the plan approval dialog. The plan was not approved and you are still in Plan Mode.',
      returnDisplay: 'Cancelled',
    });
  });

  it('should throw error during build if plan path is outside plans directory', () => {
    expect(() => tool.build({ plan_path: '../../../etc/passwd' })).toThrow(
      /Access denied/,
    );
  });

  describe('validateToolParams', () => {
    it('should reject empty plan_path', () => {
      const result = tool.validateToolParams({ plan_path: '' });
      expect(result).toBe('plan_path is required.');
    });

    it('should reject whitespace-only plan_path', () => {
      const result = tool.validateToolParams({ plan_path: '   ' });
      expect(result).toBe('plan_path is required.');
    });

    it('should reject path outside plans directory', () => {
      const result = tool.validateToolParams({
        plan_path: '../../../etc/passwd',
      });
      expect(result).toContain('Access denied');
    });

    it('should accept valid path within plans directory', () => {
      const result = tool.validateToolParams({
        plan_path: 'plans/valid-plan.md',
      });
      expect(result).toBeNull();
    });
  });
});
