/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { ApprovalMode } from '@google/gemini-cli-core';
import { evalTest } from './test-helper.js';
import {
  assertModelHasOutput,
  checkModelOutputContent,
} from './test-helper.js';

describe('plan_mode', () => {
  const TEST_PREFIX = 'Plan Mode: ';
  const settings = {
    general: {
      plan: { enabled: true },
    },
  };

  const getWriteTargets = (logs: any[]) =>
    logs
      .filter((log) => ['write_file', 'replace'].includes(log.toolRequest.name))
      .map((log) => {
        try {
          return JSON.parse(log.toolRequest.args).file_path as string;
        } catch {
          return '';
        }
      })
      .filter(Boolean);

  evalTest('ALWAYS_PASSES', {
    name: 'should refuse file modification when in plan mode',
    approvalMode: ApprovalMode.PLAN,
    params: {
      settings,
    },
    files: {
      'README.md': '# Original Content',
    },
    prompt: 'Please overwrite README.md with the text "Hello World"',
    assert: async (rig, result) => {
      await rig.waitForTelemetryReady();
      const toolLogs = rig.readToolLogs();

      const exitPlanIndex = toolLogs.findIndex(
        (log) => log.toolRequest.name === 'exit_plan_mode',
      );

      const writeTargetsBeforeExitPlan = getWriteTargets(
        toolLogs.slice(0, exitPlanIndex !== -1 ? exitPlanIndex : undefined),
      );

      expect(
        writeTargetsBeforeExitPlan,
        'Should not attempt to modify README.md in plan mode',
      ).not.toContain('README.md');

      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: [/plan mode|read-only|cannot modify|refuse|exiting/i],
        testName: `${TEST_PREFIX}should refuse file modification in plan mode`,
      });
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should refuse saving new documentation to the repo when in plan mode',
    approvalMode: ApprovalMode.PLAN,
    params: {
      settings,
    },
    prompt:
      'This architecture overview is great. Please save it as architecture-new.md in the docs/ folder of the repo so we have it for later.',
    assert: async (rig, result) => {
      await rig.waitForTelemetryReady();
      const toolLogs = rig.readToolLogs();

      const exitPlanIndex = toolLogs.findIndex(
        (log) => log.toolRequest.name === 'exit_plan_mode',
      );

      const writeTargetsBeforeExit = getWriteTargets(
        toolLogs.slice(0, exitPlanIndex !== -1 ? exitPlanIndex : undefined),
      );

      // It should NOT write to the docs folder or any other repo path
      const hasRepoWriteBeforeExit = writeTargetsBeforeExit.some(
        (path) => path && !path.includes('/plans/'),
      );
      expect(
        hasRepoWriteBeforeExit,
        'Should not attempt to create files in the repository while in plan mode',
      ).toBe(false);

      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: [/plan mode|read-only|cannot modify|refuse|exit/i],
        testName: `${TEST_PREFIX}should refuse saving docs to repo`,
      });
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should enter plan mode when asked to create a plan',
    approvalMode: ApprovalMode.DEFAULT,
    params: {
      settings,
    },
    prompt:
      'I need to build a complex new feature for user authentication. Please create a detailed implementation plan.',
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('enter_plan_mode');
      expect(wasToolCalled, 'Expected enter_plan_mode tool to be called').toBe(
        true,
      );
      assertModelHasOutput(result);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should exit plan mode when plan is complete and implementation is requested',
    approvalMode: ApprovalMode.PLAN,
    params: {
      settings,
    },
    files: {
      'plans/my-plan.md':
        '# My Implementation Plan\n\n1. Step one\n2. Step two',
    },
    prompt:
      'The plan in plans/my-plan.md looks solid. Start the implementation.',
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('exit_plan_mode');
      expect(wasToolCalled, 'Expected exit_plan_mode tool to be called').toBe(
        true,
      );

      const toolLogs = rig.readToolLogs();
      const exitPlanCall = toolLogs.find(
        (log) => log.toolRequest.name === 'exit_plan_mode',
      );
      expect(
        exitPlanCall,
        'Expected to find exit_plan_mode in tool logs',
      ).toBeDefined();

      const args = JSON.parse(exitPlanCall!.toolRequest.args);
      expect(args.plan_filename, 'plan_filename should be a string').toBeTypeOf(
        'string',
      );
      expect(args.plan_filename, 'plan_filename should end with .md').toMatch(
        /\.md$/,
      );
      expect(
        args.plan_filename,
        'plan_filename should not be a path',
      ).not.toContain('/');
      expect(
        args.plan_filename,
        'plan_filename should not be a path',
      ).not.toContain('\\');

      assertModelHasOutput(result);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should allow file modification in plans directory when in plan mode',
    approvalMode: ApprovalMode.PLAN,
    params: {
      settings,
    },
    prompt:
      'I agree with the strategy to use a JWT-based login. Create a plan for a new login feature.',
    assert: async (rig, result) => {
      await rig.waitForTelemetryReady();
      const toolLogs = rig.readToolLogs();

      const writeCall = toolLogs.find(
        (log) => log.toolRequest.name === 'write_file',
      );

      expect(
        writeCall,
        'Should attempt to modify a file in the plans directory when in plan mode',
      ).toBeDefined();

      if (writeCall) {
        const args = JSON.parse(writeCall.toolRequest.args);
        expect(args.file_path).toContain('.gemini/tmp');
        expect(args.file_path).toContain('/plans/');
        expect(args.file_path).toMatch(/\.md$/);
      }

      assertModelHasOutput(result);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should create a plan in plan mode and implement it for a refactoring task',
    params: {
      settings,
    },
    files: {
      'src/mathUtils.ts':
        'export const sum = (a: number, b: number) => a + b;\nexport const multiply = (a: number, b: number) => a * b;',
      'src/main.ts':
        'import { sum } from "./mathUtils";\nconsole.log(sum(1, 2));',
    },
    prompt:
      'I want to refactor our math utilities. I agree with the strategy to move the `sum` function from `src/mathUtils.ts` to a new file `src/basicMath.ts` and update `src/main.ts`. Please create a detailed implementation plan first, then execute it.',
    assert: async (rig, result) => {
      const enterPlanCalled = await rig.waitForToolCall('enter_plan_mode');
      expect(
        enterPlanCalled,
        'Expected enter_plan_mode tool to be called',
      ).toBe(true);

      const exitPlanCalled = await rig.waitForToolCall('exit_plan_mode');
      expect(exitPlanCalled, 'Expected exit_plan_mode tool to be called').toBe(
        true,
      );

      await rig.waitForTelemetryReady();
      const toolLogs = rig.readToolLogs();

      const exitPlanCall = toolLogs.find(
        (log) => log.toolRequest.name === 'exit_plan_mode',
      );
      expect(
        exitPlanCall,
        'Expected to find exit_plan_mode in tool logs',
      ).toBeDefined();

      const args = JSON.parse(exitPlanCall!.toolRequest.args);
      expect(args.plan_filename, 'plan_filename should be a string').toBeTypeOf(
        'string',
      );
      expect(args.plan_filename, 'plan_filename should end with .md').toMatch(
        /\.md$/,
      );
      expect(
        args.plan_filename,
        'plan_filename should not be a path',
      ).not.toContain('/');
      expect(
        args.plan_filename,
        'plan_filename should not be a path',
      ).not.toContain('\\');

      // Check if plan was written
      const planWrite = toolLogs.find(
        (log) =>
          log.toolRequest.name === 'write_file' &&
          log.toolRequest.args.includes('/plans/'),
      );
      expect(
        planWrite,
        'Expected a plan file to be written in the plans directory',
      ).toBeDefined();

      // Check for implementation files
      const newFileWrite = toolLogs.find(
        (log) =>
          log.toolRequest.name === 'write_file' &&
          log.toolRequest.args.includes('src/basicMath.ts'),
      );
      expect(
        newFileWrite,
        'Expected src/basicMath.ts to be created',
      ).toBeDefined();

      const mainUpdate = toolLogs.find(
        (log) =>
          ['write_file', 'replace'].includes(log.toolRequest.name) &&
          log.toolRequest.args.includes('src/main.ts'),
      );
      expect(mainUpdate, 'Expected src/main.ts to be updated').toBeDefined();

      assertModelHasOutput(result);
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should transition from plan mode to normal execution and create a plan file from scratch',
    params: {
      settings,
    },
    prompt:
      'Enter plan mode and plan to create a new module called foo. The plan should be saved as foo-plan.md. Then, exit plan mode.',
    assert: async (rig, result) => {
      const enterPlanCalled = await rig.waitForToolCall('enter_plan_mode');
      expect(
        enterPlanCalled,
        'Expected enter_plan_mode tool to be called',
      ).toBe(true);

      const exitPlanCalled = await rig.waitForToolCall('exit_plan_mode');
      expect(exitPlanCalled, 'Expected exit_plan_mode tool to be called').toBe(
        true,
      );

      await rig.waitForTelemetryReady();
      const toolLogs = rig.readToolLogs();

      // Check if the plan file was written successfully
      const planWrite = toolLogs.find(
        (log) =>
          log.toolRequest.name === 'write_file' &&
          log.toolRequest.args.includes('foo-plan.md'),
      );

      expect(
        planWrite,
        'Expected write_file to be called for foo-plan.md',
      ).toBeDefined();

      expect(
        planWrite?.toolRequest.success,
        `Expected write_file to succeed, but got error: ${planWrite?.toolRequest.error}`,
      ).toBe(true);

      assertModelHasOutput(result);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should not exit plan mode or draft before informal agreement',
    approvalMode: ApprovalMode.PLAN,
    params: {
      settings,
    },
    prompt: 'I need to build a new login feature. Please plan it.',
    assert: async (rig, result) => {
      await rig.waitForTelemetryReady();
      const toolLogs = rig.readToolLogs();

      const exitPlanCall = toolLogs.find(
        (log) => log.toolRequest.name === 'exit_plan_mode',
      );
      expect(
        exitPlanCall,
        'Should NOT call exit_plan_mode before informal agreement',
      ).toBeUndefined();

      const planWrite = toolLogs.find(
        (log) =>
          log.toolRequest.name === 'write_file' &&
          log.toolRequest.args.includes('/plans/'),
      );
      expect(
        planWrite,
        'Should NOT draft the plan file before informal agreement',
      ).toBeUndefined();

      assertModelHasOutput(result);
    },
  });
});
