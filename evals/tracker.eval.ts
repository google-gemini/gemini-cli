/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { ApprovalMode } from '@google/gemini-cli-core';
import { evalTest, assertModelHasOutput } from './test-helper.js';
import fs from 'node:fs';
import path from 'node:path';

const FILES = {
  'package.json': JSON.stringify({
    name: 'test-project',
    version: '1.0.0',
    scripts: { test: 'echo "All tests passed!"' },
  }),
  'src/login.js':
    'function login(username, password) {\n  if (!username) throw new Error("Missing username");\n  // BUG: missing password check\n  return true;\n}',
} as const;

describe('tracker_mode', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should manage tasks in the tracker when explicitly requested during a bug fix',
    approvalMode: ApprovalMode.YOLO,
    params: {
      settings: { experimental: { taskTracker: true } },
    },
    files: FILES,
    prompt:
      'We have a bug in src/login.js: the password check is missing. First, create a task in the tracker to fix it. Then fix the bug, and mark the task as closed.',
    assert: async (rig, result) => {
      const wasCreateCalled = await rig.waitForToolCall('tracker_create_task');
      expect(
        wasCreateCalled,
        'Expected tracker_create_task tool to be called',
      ).toBe(true);

      const toolLogs = rig.readToolLogs();
      const createCall = toolLogs.find(
        (log) => log.toolRequest.name === 'tracker_create_task',
      );
      if (createCall) {
        const args = JSON.parse(createCall.toolRequest.args);
        expect(
          args.title?.toLowerCase() || args.description?.toLowerCase(),
        ).toContain('login');
      }

      const wasUpdateCalled = await rig.waitForToolCall('tracker_update_task');
      expect(
        wasUpdateCalled,
        'Expected tracker_update_task tool to be called',
      ).toBe(true);

      const updateCall = toolLogs.find(
        (log) => log.toolRequest.name === 'tracker_update_task',
      );
      if (updateCall) {
        const args = JSON.parse(updateCall.toolRequest.args);
        expect(args.status).toBe('closed');
      }

      const loginContent = fs.readFileSync(
        path.join(rig.testDir!, 'src/login.js'),
        'utf-8',
      );
      expect(loginContent).not.toContain('// BUG: missing password check');

      assertModelHasOutput(result);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should implicitly create tasks when asked to build a feature plan',
    approvalMode: ApprovalMode.YOLO,
    params: {
      settings: { experimental: { taskTracker: true } },
    },
    files: FILES,
    prompt:
      'I need to build a complex new feature for user authentication in our project. Create a detailed implementation plan and organize the work into bite-sized chunks. Do not actually implement the code yet, just plan it.',
    assert: async (rig, result) => {
      // The model should proactively use tracker_create_task to organize the work
      const wasToolCalled = await rig.waitForToolCall('tracker_create_task');
      expect(
        wasToolCalled,
        'Expected tracker_create_task to be called implicitly to organize plan',
      ).toBe(true);

      const toolLogs = rig.readToolLogs();
      const createCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'tracker_create_task',
      );

      // We expect it to create at least one task for authentication, likely more.
      expect(createCalls.length).toBeGreaterThan(0);

      // Verify it didn't write any code since we asked it to just plan
      const loginContent = fs.readFileSync(
        path.join(rig.testDir!, 'src/login.js'),
        'utf-8',
      );
      expect(loginContent).toContain('// BUG: missing password check');

      assertModelHasOutput(result);
    },
  });
});
