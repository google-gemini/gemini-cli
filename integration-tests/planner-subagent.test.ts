/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import fs from 'node:fs';
import path from 'node:path';
import { ApprovalMode } from '../packages/core/src/policy/types.js';

describe('Planner Subagent E2E', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should enter plan mode, create a plan, and exit plan mode', async () => {
    // We'll use a real run to see if it works. 
    // We need to enable the planner agent and the required tools.
    await rig.setup('planner-subagent-e2e', {
      settings: {
        experimental: { 
            plan: true,
            agents: true
        },
        tools: {
          core: [
            'enter_plan_mode',
            'exit_plan_mode',
            'write_file',
            'read_file',
            'list_directory',
          ],
        },
        // Add policy to allow enter_plan_mode without confirmation in yolo mode
        // Actually TestRig.run uses --approval-mode=yolo by default if not specified.
        // But enter_plan_mode and exit_plan_mode might still ask if not explicitly allowed.
        policy: {
            rules: [
                { toolName: 'enter_plan_mode', decision: 'ALLOW' },
                { toolName: 'exit_plan_mode', decision: 'ALLOW' },
                { toolName: 'write_file', decision: 'ALLOW' }
            ]
        }
      },
    });

    rig.mkdir('plans');
    rig.createFile('hello.ts', 'console.log("hello");');

    // Prompt the agent to create a plan for refactoring hello.ts
    // We expect:
    // 1. Main agent calls enter_plan_mode
    // 2. Planner subagent is launched
    // 3. Planner subagent reads hello.ts
    // 4. Planner subagent writes plans/refactor.md
    // 5. Planner subagent calls exit_plan_mode
    // 6. Main agent resumes
    
    await rig.run({
      stdin: 'Please create a refactoring plan for hello.ts to use a function. Put the plan in plans/refactor.md and then approve it.',
      approvalMode: 'yolo',
      timeout: 60000, // Planning can take a while
    });

    // 1. Verify enter_plan_mode was called
    const enterPlanCalled = await rig.waitForToolCall('enter_plan_mode');
    expect(enterPlanCalled).toBe(true);

    // 2. Verify write_file was called for the plan
    const writeFileCalled = await rig.waitForToolCall('write_file', 20000, (args) => {
        return args.includes('plans/refactor.md');
    });
    expect(writeFileCalled).toBe(true);

    // 3. Verify exit_plan_mode was called
    const exitPlanCalled = await rig.waitForToolCall('exit_plan_mode');
    expect(exitPlanCalled).toBe(true);

    // 4. Verify the plan file exists on disk
    const planPath = path.join(rig.testDir!, 'plans/refactor.md');
    expect(fs.existsSync(planPath)).toBe(true);
    const planContent = fs.readFileSync(planPath, 'utf-8');
    expect(planContent).toContain('hello.ts');
  });
});
