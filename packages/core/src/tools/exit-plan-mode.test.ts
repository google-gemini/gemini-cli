/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExitPlanModeTool, ExitPlanModeInvocation } from './exit-plan-mode.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import path from 'node:path';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { ToolConfirmationOutcome } from './tools.js';
import { ApprovalMode } from '../policy/types.js';
import * as fs from 'node:fs';
import os from 'node:os';
import { validatePlanPath } from '../utils/planUtils.js';
import * as loggers from '../telemetry/loggers.js';

vi.mock('../telemetry/loggers.js', () => ({
  logPlanExecution: vi.fn(),
}));

describe('ExitPlanModeTool', () => {
  let tool: ExitPlanModeTool;
  let mockMessageBus: ReturnType<typeof createMockMessageBus>;
  let mockConfig: Partial<Config>;
  let tempRootDir: string;
  let mockPlansDir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    mockMessageBus = createMockMessageBus();
    vi.mocked(mockMessageBus.publish).mockResolvedValue(undefined);

    tempRootDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'exit-plan-test-')),
    );
    const plansDirRaw = path.join(tempRootDir, 'plans');
    fs.mkdirSync(plansDirRaw, { recursive: true });
    mockPlansDir = fs.realpathSync(plansDirRaw);

    mockConfig = {
      getTargetDir: vi.fn().mockReturnValue(tempRootDir),
      setApprovalMode: vi.fn(),
      setApprovedPlanPath: vi.fn(),
      storage: {
        getPlansDir: vi.fn().mockReturnValue(mockPlansDir),
      } as unknown as Config['storage'],
    };
    tool = new ExitPlanModeTool(
      mockConfig as Config,
      mockMessageBus as unknown as MessageBus,
    );
    // Mock getMessageBusDecision on the invocation prototype
    vi.spyOn(
      ExitPlanModeInvocation.prototype as unknown as {
        getMessageBusDecision: () => Promise<string>;
      },
      'getMessageBusDecision',
    ).mockResolvedValue('ASK_USER');
  });

  afterEach(() => {
    if (fs.existsSync(tempRootDir)) {
      fs.rmSync(tempRootDir, { recursive: true, force: true });
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const createPlanFile = (name: string, content: string) => {
    const filePath = path.join(mockPlansDir, name);
    fs.writeFileSync(filePath, content);
    return path.join('plans', name);
  };

  describe('shouldConfirmExecute', () => {
    it('should return plan approval confirmation details when plan has content', async () => {
      const planRelativePath = createPlanFile('test-plan.md', '# My Plan');
      const invocation = tool.build({ plan_path: planRelativePath });

      const result = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(result).not.toBe(false);
      if (result === false) return;

      expect(result.type).toBe('exit_plan_mode');
      expect(result.title).toBe('Plan Approval');
      if (result.type === 'exit_plan_mode') {
        expect(result.planPath).toBe(path.join(mockPlansDir, 'test-plan.md'));
      }
      expect(typeof result.onConfirm).toBe('function');
    });

    it('should return false when plan file is empty', async () => {
      const planRelativePath = createPlanFile('empty.md', '   ');
      const invocation = tool.build({ plan_path: planRelativePath });

      const result = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(result).toBe(false);
    });

    it('should return false when plan file cannot be read', async () => {
      const planRelativePath = path.join('plans', 'non-existent.md');
      const invocation = tool.build({ plan_path: planRelativePath });

      const result = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(result).toBe(false);
    });

    it('should auto-approve when policy decision is ALLOW', async () => {
      const planRelativePath = createPlanFile('test.md', '# Content');
      const invocation = tool.build({ plan_path: planRelativePath });

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
      // Verify it auto-approved internally
      const executeResult = await invocation.execute(
        new AbortController().signal,
      );
      expect(executeResult.llmContent).toContain('Plan approved');
    });

    it('should throw error when policy decision is DENY', async () => {
      const planRelativePath = createPlanFile('test.md', '# Content');
      const invocation = tool.build({ plan_path: planRelativePath });

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

  describe('execute with invalid plan', () => {
    it('should return error when plan file is empty', async () => {
      const planRelativePath = createPlanFile('empty.md', '');
      const invocation = tool.build({ plan_path: planRelativePath });

      await invocation.shouldConfirmExecute(new AbortController().signal);
      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toContain('Plan file is empty');
      expect(result.llmContent).toContain('write content to the plan');
    });

    it('should return error when plan file cannot be read', async () => {
      const planRelativePath = 'plans/ghost.md';
      const invocation = tool.build({ plan_path: planRelativePath });

      await invocation.shouldConfirmExecute(new AbortController().signal);
      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toContain('Plan file does not exist');
    });
  });

  describe('execute', () => {
    it('should return approval message when plan is approved with DEFAULT mode', async () => {
      const planRelativePath = createPlanFile('test.md', '# Content');
      const invocation = tool.build({ plan_path: planRelativePath });

      const confirmDetails = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmDetails).not.toBe(false);
      if (confirmDetails === false) return;

      await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce, {
        approved: true,
        approvalMode: ApprovalMode.DEFAULT,
      });

      const result = await invocation.execute(new AbortController().signal);
      const expectedPath = path.join(mockPlansDir, 'test.md');

      expect(result).toEqual({
        llmContent: `Plan approved. Switching to Default mode (edits will require confirmation).

The approved implementation plan is stored at: ${expectedPath}
Read and follow the plan strictly during implementation.`,
        returnDisplay: `Plan approved: ${expectedPath}`,
      });
      expect(mockConfig.setApprovedPlanPath).toHaveBeenCalledWith(expectedPath);
    });

    it('should return approval message when plan is approved with AUTO_EDIT mode', async () => {
      const planRelativePath = createPlanFile('test.md', '# Content');
      const invocation = tool.build({ plan_path: planRelativePath });

      const confirmDetails = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmDetails).not.toBe(false);
      if (confirmDetails === false) return;

      await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce, {
        approved: true,
        approvalMode: ApprovalMode.AUTO_EDIT,
      });

      const result = await invocation.execute(new AbortController().signal);
      const expectedPath = path.join(mockPlansDir, 'test.md');

      expect(result).toEqual({
        llmContent: `Plan approved. Switching to Auto-Edit mode (edits will be applied automatically).

The approved implementation plan is stored at: ${expectedPath}
Read and follow the plan strictly during implementation.`,
        returnDisplay: `Plan approved: ${expectedPath}`,
      });
      expect(mockConfig.setApprovalMode).toHaveBeenCalledWith(
        ApprovalMode.AUTO_EDIT,
      );
      expect(mockConfig.setApprovedPlanPath).toHaveBeenCalledWith(expectedPath);
    });

    it('should return feedback message when plan is rejected with feedback', async () => {
      const planRelativePath = createPlanFile('test.md', '# Content');
      const invocation = tool.build({ plan_path: planRelativePath });

      const confirmDetails = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmDetails).not.toBe(false);
      if (confirmDetails === false) return;

      await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce, {
        approved: false,
        feedback: 'Please add more details.',
      });

      const result = await invocation.execute(new AbortController().signal);
      const expectedPath = path.join(mockPlansDir, 'test.md');

      expect(result).toEqual({
        llmContent: `Plan rejected. User feedback: Please add more details.

The plan is stored at: ${expectedPath}
Revise the plan based on the feedback.`,
        returnDisplay: 'Feedback: Please add more details.',
      });
    });

    it('should handle rejection without feedback gracefully', async () => {
      const planRelativePath = createPlanFile('test.md', '# Content');
      const invocation = tool.build({ plan_path: planRelativePath });

      const confirmDetails = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmDetails).not.toBe(false);
      if (confirmDetails === false) return;

      await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce, {
        approved: false,
      });

      const result = await invocation.execute(new AbortController().signal);
      const expectedPath = path.join(mockPlansDir, 'test.md');

      expect(result).toEqual({
        llmContent: `Plan rejected. No feedback provided.

The plan is stored at: ${expectedPath}
Ask the user for specific feedback on how to improve the plan.`,
        returnDisplay: 'Rejected (no feedback)',
      });
    });

    it('should log plan execution event when plan is approved', async () => {
      const planRelativePath = createPlanFile('test.md', '# Content');
      const invocation = tool.build({ plan_path: planRelativePath });

      const confirmDetails = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      if (confirmDetails === false) return;

      await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce, {
        approved: true,
        approvalMode: ApprovalMode.AUTO_EDIT,
      });

      await invocation.execute(new AbortController().signal);

      expect(loggers.logPlanExecution).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          approval_mode: ApprovalMode.AUTO_EDIT,
        }),
      );
    });

    it('should return cancellation message when cancelled', async () => {
      const planRelativePath = createPlanFile('test.md', '# Content');
      const invocation = tool.build({ plan_path: planRelativePath });

      const confirmDetails = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmDetails).not.toBe(false);
      if (confirmDetails === false) return;

      await confirmDetails.onConfirm(ToolConfirmationOutcome.Cancel);

      const result = await invocation.execute(new AbortController().signal);

      expect(result).toEqual({
        llmContent:
          'User cancelled the plan approval dialog. The plan was not approved and you are still in Plan Mode.',
        returnDisplay: 'Cancelled',
      });
    });
  });

  describe('getApprovalModeDescription (internal)', () => {
    it('should handle all valid approval modes', async () => {
      const planRelativePath = createPlanFile('test.md', '# Content');
      const invocation = tool.build({ plan_path: planRelativePath });

      const testMode = async (mode: ApprovalMode, expected: string) => {
        const confirmDetails = await invocation.shouldConfirmExecute(
          new AbortController().signal,
        );
        if (confirmDetails === false) return;

        await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce, {
          approved: true,
          approvalMode: mode,
        });

        const result = await invocation.execute(new AbortController().signal);
        expect(result.llmContent).toContain(expected);
      };

      await testMode(
        ApprovalMode.AUTO_EDIT,
        'Auto-Edit mode (edits will be applied automatically)',
      );
      await testMode(
        ApprovalMode.DEFAULT,
        'Default mode (edits will require confirmation)',
      );
    });

    it('should throw for invalid post-planning modes', async () => {
      const planRelativePath = createPlanFile('test.md', '# Content');
      const invocation = tool.build({ plan_path: planRelativePath });

      const testInvalidMode = async (mode: ApprovalMode) => {
        const confirmDetails = await invocation.shouldConfirmExecute(
          new AbortController().signal,
        );
        if (confirmDetails === false) return;

        await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce, {
          approved: true,
          approvalMode: mode,
        });

        await expect(
          invocation.execute(new AbortController().signal),
        ).rejects.toThrow(/Unexpected approval mode/);
      };

      await testInvalidMode(ApprovalMode.YOLO);
      await testInvalidMode(ApprovalMode.PLAN);
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

    it('should reject non-existent plan file', async () => {
      const result = await validatePlanPath(
        'plans/ghost.md',
        mockPlansDir,
        tempRootDir,
      );
      expect(result).toContain('Plan file does not exist');
    });

    it('should reject symbolic links pointing outside the plans directory', () => {
      const outsideFile = path.join(tempRootDir, 'outside.txt');
      fs.writeFileSync(outsideFile, 'secret');
      const maliciousPath = path.join(mockPlansDir, 'malicious.md');
      fs.symlinkSync(outsideFile, maliciousPath);

      const result = tool.validateToolParams({
        plan_path: 'plans/malicious.md',
      });

      expect(result).toBe(
        'Access denied: plan path must be within the designated plans directory.',
      );
    });

    it('should accept valid path within plans directory', () => {
      createPlanFile('valid.md', '# Content');
      const result = tool.validateToolParams({
        plan_path: 'plans/valid.md',
      });
      expect(result).toBeNull();
    });
  });
});
