/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import {
  TRACKER_CREATE_TASK_TOOL_NAME,
  TRACKER_UPDATE_TASK_TOOL_NAME,
} from '@google/gemini-cli-core';
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
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'should manage tasks in the tracker when explicitly requested during a bug fix',
    params: {
      settings: { experimental: { taskTracker: true } },
    },
    files: FILES,
    prompt:
      'We have a bug in src/login.js: the password check is missing. First, create a task in the tracker to fix it. Then fix the bug, and mark the task as closed.',
    assert: async (rig, result) => {
      const wasCreateCalled = await rig.waitForToolCall(
        TRACKER_CREATE_TASK_TOOL_NAME,
      );
      expect(
        wasCreateCalled,
        'Expected tracker_create_task tool to be called',
      ).toBe(true);

      const toolLogs = rig.readToolLogs();
      const createCall = toolLogs.find(
        (log) => log.toolRequest.name === TRACKER_CREATE_TASK_TOOL_NAME,
      );
      expect(createCall).toBeDefined();
      const args = JSON.parse(createCall!.toolRequest.args);
      expect(
        (args.title?.toLowerCase() ?? '') +
          (args.description?.toLowerCase() ?? ''),
      ).toContain('login');

      const wasUpdateCalled = await rig.waitForToolCall(
        TRACKER_UPDATE_TASK_TOOL_NAME,
      );
      expect(
        wasUpdateCalled,
        'Expected tracker_update_task tool to be called',
      ).toBe(true);

      const updateCalls = toolLogs.filter(
        (log) => log.toolRequest.name === TRACKER_UPDATE_TASK_TOOL_NAME,
      );
      expect(updateCalls.length).toBeGreaterThan(0);
      const updateArgs = JSON.parse(
        updateCalls[updateCalls.length - 1].toolRequest.args,
      );
      expect(updateArgs.status).toBe('closed');

      const loginContent = fs.readFileSync(
        path.join(rig.testDir!, 'src/login.js'),
        'utf-8',
      );
      expect(loginContent).not.toContain('// BUG: missing password check');

      assertModelHasOutput(result);
    },
  });

  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'should implicitly create tasks when asked to build a feature plan',
    params: {
      settings: { experimental: { taskTracker: true } },
    },
    files: FILES,
    prompt:
      'I need to build a complex new feature for user authentication in our project. Create a detailed implementation plan and organize the work into bite-sized chunks. Do not actually implement the code yet, just plan it.',
    assert: async (rig, result) => {
      // The model should proactively use tracker_create_task to organize the work
      const wasToolCalled = await rig.waitForToolCall(
        TRACKER_CREATE_TASK_TOOL_NAME,
      );
      expect(
        wasToolCalled,
        'Expected tracker_create_task to be called implicitly to organize plan',
      ).toBe(true);

      const toolLogs = rig.readToolLogs();
      const createCalls = toolLogs.filter(
        (log) => log.toolRequest.name === TRACKER_CREATE_TASK_TOOL_NAME,
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

  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'should correctly identify the task tracker storage location from the system prompt',
    params: {
      settings: { experimental: { taskTracker: true } },
    },
    prompt:
      'Where is my task tracker storage located? Please provide the absolute path in your response.',
    assert: async (rig, result) => {
      // The response should contain the dynamic path which follows the .gemini/tmp/.../tracker structure.
      expect(result).toMatch(/\.gemini\/tmp\/.*\/tracker/);
    },
  });

  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'should update the tracker in the same turn as the task completion to save turns',
    params: {
      settings: { experimental: { taskTracker: true } },
    },
    files: FILES,
    prompt:
      'We have a bug in src/login.js: the password check is missing. Fix this bug. Then, create a new file src/auth.js that exports a simple verifyToken function. Please organize this into tasks and execute them.',
    assert: async (rig, result) => {
      await rig.waitForToolCall(TRACKER_CREATE_TASK_TOOL_NAME);
      await rig.waitForToolCall(TRACKER_UPDATE_TASK_TOOL_NAME);

      const toolLogs = rig.readToolLogs();

      // Get the prompt ID of the fix for login.js
      const loginEditCalls = toolLogs.filter(
        (log) =>
          (log.toolRequest.name === 'replace' ||
            log.toolRequest.name === 'write_file') &&
          log.toolRequest.args.includes('login.js'),
      );

      expect(loginEditCalls.length).toBeGreaterThan(0);
      const loginEditPromptId =
        loginEditCalls[loginEditCalls.length - 1].toolRequest.prompt_id;

      // Verify there is an update to the tracker in the exact same turn
      const parallelTrackerUpdates = toolLogs.filter(
        (log) =>
          log.toolRequest.name === TRACKER_UPDATE_TASK_TOOL_NAME &&
          log.toolRequest.prompt_id === loginEditPromptId,
      );

      expect(
        parallelTrackerUpdates.length,
        'Expected tracker_update_task to be called in the same turn as the login.js fix',
      ).toBeGreaterThan(0);

      assertModelHasOutput(result);
    },
  });
});
