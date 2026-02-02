/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExitPlanModeTool } from './exit-plan-mode.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import path from 'node:path';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { ToolConfirmationOutcome } from './tools.js';
import { ApprovalMode } from '../policy/types.js';
import * as fs from 'node:fs';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    existsSync: vi.fn(),
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
    },
  };
});

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
    // Default: plan file has content and exists
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.promises.readFile).mockResolvedValue(
      '# My Plan\n\nSome content',
    );
    mockConfig = {
      getTargetDir: vi.fn().mockReturnValue(mockTargetDir),
      setApprovalMode: vi.fn(),
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

  describe('shouldConfirmExecute', () => {
    it('should return plan approval confirmation details when plan has content', async () => {
      const planPath = 'plans/test-plan.md';
      const invocation = tool.build({ plan_path: planPath });

      const result = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(result).not.toBe(false);
      if (result === false) return;

      expect(result.type).toBe('exit_plan_mode');
      expect(result.title).toBe('Plan Approval');
      if (result.type === 'exit_plan_mode') {
        expect(result.planPath).toBe(
          path.resolve(mockPlansDir, 'test-plan.md'),
        );
      }
      expect(typeof result.onConfirm).toBe('function');
    });

    it('should return false when plan file is empty', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue('');
      const planPath = 'plans/test-plan.md';
      const invocation = tool.build({ plan_path: planPath });

      const result = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(result).toBe(false);
    });

    it('should return false when plan file contains only whitespace', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue('   \n\t\n   ');
      const planPath = 'plans/test-plan.md';
      const invocation = tool.build({ plan_path: planPath });

      const result = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(result).toBe(false);
    });

    it('should return false when plan file cannot be read', async () => {
      vi.mocked(fs.promises.readFile).mockRejectedValue(
        new Error('ENOENT: no such file'),
      );
      const planPath = 'plans/test-plan.md';
      const invocation = tool.build({ plan_path: planPath });

      const result = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(result).toBe(false);
    });
  });

  describe('execute with invalid plan', () => {
    it('should return error when plan file is empty', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue('');
      const planPath = 'plans/test-plan.md';
      const invocation = tool.build({ plan_path: planPath });

      // shouldConfirmExecute returns false, so execute is called directly
      await invocation.shouldConfirmExecute(new AbortController().signal);
      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toContain('Plan file is empty');
      expect(result.llmContent).toContain('write content to the plan');
    });

    it('should return error when plan file cannot be read', async () => {
      vi.mocked(fs.promises.readFile).mockRejectedValue(
        new Error('ENOENT: no such file'),
      );
      const planPath = 'plans/test-plan.md';
      const invocation = tool.build({ plan_path: planPath });

      await invocation.shouldConfirmExecute(new AbortController().signal);
      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toContain('Failed to read plan file');
      expect(result.llmContent).toContain('ENOENT');
    });
  });

  describe('execute', () => {
    it('should return approval message when plan is approved with DEFAULT mode', async () => {
      const planPath = 'plans/test-plan.md';
      const invocation = tool.build({ plan_path: planPath });

      // Simulate the confirmation flow
      const confirmDetails = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmDetails).not.toBe(false);
      if (confirmDetails === false) return;

      // Call onConfirm with approval (using default approval mode)
      await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce, {
        approved: true,
        approvalMode: ApprovalMode.DEFAULT,
      });

      const result = await invocation.execute(new AbortController().signal);
      const expectedPath = path.resolve(mockPlansDir, 'test-plan.md');

      expect(result).toEqual({
        llmContent: `Plan approved. Switching to Default mode (edits will require confirmation).

The approved implementation plan is stored at: ${expectedPath}
Read and follow the plan strictly during implementation.`,
        returnDisplay: `Plan approved: ${expectedPath}`,
      });
    });

    it('should return approval message when plan is approved with AUTO_EDIT mode', async () => {
      const planPath = 'plans/test-plan.md';
      const invocation = tool.build({ plan_path: planPath });

      // Simulate the confirmation flow
      const confirmDetails = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmDetails).not.toBe(false);
      if (confirmDetails === false) return;

      // Call onConfirm with approval (using auto-edit approval mode)
      await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce, {
        approved: true,
        approvalMode: ApprovalMode.AUTO_EDIT,
      });

      const result = await invocation.execute(new AbortController().signal);
      const expectedPath = path.resolve(mockPlansDir, 'test-plan.md');

      expect(result).toEqual({
        llmContent: `Plan approved. Switching to Auto-Edit mode (edits will be applied automatically).

The approved implementation plan is stored at: ${expectedPath}
Read and follow the plan strictly during implementation.`,
        returnDisplay: `Plan approved: ${expectedPath}`,
      });
      expect(mockConfig.setApprovalMode).toHaveBeenCalledWith(
        ApprovalMode.AUTO_EDIT,
      );
    });

    it('should return feedback message when plan is rejected with feedback', async () => {
      const planPath = 'plans/test-plan.md';
      const invocation = tool.build({ plan_path: planPath });

      // Simulate the confirmation flow
      const confirmDetails = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmDetails).not.toBe(false);
      if (confirmDetails === false) return;

      // Call onConfirm with rejection and feedback
      await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce, {
        approved: false,
        feedback: 'Please add more details.',
      });

      const result = await invocation.execute(new AbortController().signal);
      const expectedPath = path.resolve(mockPlansDir, 'test-plan.md');

      expect(result).toEqual({
        llmContent: `Plan rejected. User feedback: Please add more details.

The plan is stored at: ${expectedPath}
Revise the plan based on the feedback.`,
        returnDisplay: 'Feedback: Please add more details.',
      });
    });

    it('should handle rejection without feedback gracefully', async () => {
      const planPath = 'plans/test-plan.md';
      const invocation = tool.build({ plan_path: planPath });

      // Simulate the confirmation flow
      const confirmDetails = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmDetails).not.toBe(false);
      if (confirmDetails === false) return;

      // Call onConfirm with rejection but no feedback (edge case)
      await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce, {
        approved: false,
      });

      const result = await invocation.execute(new AbortController().signal);
      const expectedPath = path.resolve(mockPlansDir, 'test-plan.md');

      expect(result).toEqual({
        llmContent: `Plan rejected. No feedback provided.

The plan is stored at: ${expectedPath}
Ask the user for specific feedback on how to improve the plan.`,
        returnDisplay: 'Rejected (no feedback)',
      });
    });

    it('should return cancellation message when cancelled', async () => {
      const planPath = 'plans/test-plan.md';
      const invocation = tool.build({ plan_path: planPath });

      // Simulate the confirmation flow
      const confirmDetails = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmDetails).not.toBe(false);
      if (confirmDetails === false) return;

      // Call onConfirm with cancellation
      await confirmDetails.onConfirm(ToolConfirmationOutcome.Cancel);

      const result = await invocation.execute(new AbortController().signal);

      expect(result).toEqual({
        llmContent:
          'User cancelled the plan approval dialog. The plan was not approved and you are still in Plan Mode.',
        returnDisplay: 'Cancelled',
      });
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

    it('should reject non-existent plan file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = tool.validateToolParams({
        plan_path: 'plans/ghost.md',
      });
      expect(result).toContain('Plan file does not exist');
    });

    it('should accept valid path within plans directory', () => {
      const result = tool.validateToolParams({
        plan_path: 'plans/valid-plan.md',
      });
      expect(result).toBeNull();
    });
  });
});
