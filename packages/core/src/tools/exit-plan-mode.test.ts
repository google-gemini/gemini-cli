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
import * as fsPromises from 'node:fs/promises';
import * as fs from 'node:fs';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

vi.mock('node:fs');
vi.mock('node:fs/promises');

describe('ExitPlanModeTool', () => {
  let tool: ExitPlanModeTool;
  let mockMessageBus: ReturnType<typeof createMockMessageBus>;
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockMessageBus = createMockMessageBus();
    vi.mocked(mockMessageBus.publish).mockResolvedValue(undefined);
    mockConfig = {
      getTargetDir: vi.fn().mockReturnValue('/mock/dir'),
      storage: {
        getProjectTempPlansDir: vi.fn().mockReturnValue('/mock/dir/plans'),
      } as unknown as Config['storage'],
    };
    tool = new ExitPlanModeTool(
      mockConfig as Config,
      mockMessageBus as unknown as MessageBus,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fail execution if plan file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    // Use vi.mocked directly, assuming it's already a mock from vi.mock at top of file
    vi.mocked(fsPromises.readFile).mockRejectedValue(
      new Error('ENOENT: no such file or directory'),
    );

    // @ts-expect-error - accessing protected method for testing
    const invocation = tool.createInvocation(
      { plan_path: 'plans/non-existent.md' },
      mockMessageBus as unknown as MessageBus,
      'exit_plan_mode',
      'Exit Plan Mode',
    );

    // Mock the message bus to simulate approval so we reach the read
    const executionPromise = invocation.execute(new AbortController().signal);
    await new Promise((resolve) => setTimeout(resolve, 0));

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
    expect(result.returnDisplay).toContain('Error reading plan file');
  });

  it('should publish PLAN_APPROVAL_REQUEST and resolve on approval with content', async () => {
    const planPath = 'plans/test-plan.md';
    const planContent = '# Test Plan Content';
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      planContent as unknown as string,
    );

    // @ts-expect-error - accessing protected method for testing
    const invocation = tool.createInvocation(
      { plan_path: planPath },
      mockMessageBus as unknown as MessageBus,
      'exit_plan_mode',
      'Exit Plan Mode',
    );
    const executionPromise = invocation.execute(new AbortController().signal);

    // Wait for the request to be published
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockMessageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.PLAN_APPROVAL_REQUEST,
        planPath,
      }),
    );

    // Simulate response
    const requestCall = vi
      .mocked(mockMessageBus.publish)
      .mock.calls.find(
        (call) => call[0].type === MessageBusType.PLAN_APPROVAL_REQUEST,
      );
    const correlationId = (requestCall![0] as PlanApprovalRequest)
      .correlationId;

    // Simulate approval response via the subscription handler
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
    expect(result).toEqual({
      llmContent: 'Plan approved. Switching to Default mode.',
      returnDisplay: planContent,
    });
  });

  it('should resolve with feedback on rejection', async () => {
    const planPath = 'plans/test-plan.md';
    const planContent = '# Test Plan Content';
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      planContent as unknown as string,
    );

    // @ts-expect-error - accessing protected method for testing
    const invocation = tool.createInvocation(
      { plan_path: planPath },
      mockMessageBus as unknown as MessageBus,
      'exit_plan_mode',
      'Exit Plan Mode',
    );
    const executionPromise = invocation.execute(new AbortController().signal);

    await new Promise((resolve) => setTimeout(resolve, 0));

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
    expect(result).toEqual({
      llmContent: 'Plan rejected. Feedback: Please add more details.',
      returnDisplay: `Feedback: Please add more details.\n\n---\n\n${planContent}`,
    });
  });
});
