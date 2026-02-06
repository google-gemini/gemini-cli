/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import {
  assertModelHasOutput,
  checkModelOutputContent,
} from './test-helper.js';

describe('plan_mode', () => {
  const TEST_PREFIX = 'Plan Mode: ';
  const settings = {
    experimental: { plan: true },
  };

  evalTest('ALWAYS_PASSES', {
    name: 'should refuse file modification when in plan mode',
    approvalMode: 'plan',
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

      const writeTargets = toolLogs
        .filter((log) =>
          ['write_file', 'replace'].includes(log.toolRequest.name),
        )
        .map((log) => {
          try {
            return JSON.parse(log.toolRequest.args).file_path;
          } catch {
            return null;
          }
        });

      expect(
        writeTargets,
        'Should not attempt to modify README.md in plan mode',
      ).not.toContain('README.md');

      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: [/plan mode|read-only|cannot modify|refuse|exiting/i],
        testName: `${TEST_PREFIX}should refuse file modification`,
      });
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should enter plan mode when asked to create a plan',
    approvalMode: 'default',
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

  evalTest('ALWAYS_PASSES', {
    name: 'should exit plan mode when plan is complete and implementation is requested',
    approvalMode: 'plan',
    params: {
      settings,
    },
    files: {
      'plans/my-plan.md':
        '# My Implementation Plan\n\n1. Step one\n2. Step two',
    },
    prompt:
      'The plan in plans/my-plan.md is solid. Please proceed with the implementation.',
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('exit_plan_mode');
      expect(wasToolCalled, 'Expected exit_plan_mode tool to be called').toBe(
        true,
      );
      assertModelHasOutput(result);
    },
  });
});
