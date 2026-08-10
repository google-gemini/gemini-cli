/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { appEvalTest } from './app-test-helper.js';

describe.sequential('tracker_queries', () => {
  appEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent calls tracker_list_tasks when asked to list active tasks in the task tracker',
    configOverrides: {
      tracker: true,
    },
    prompt: 'List all current tasks and their status from the task tracker.',
    setup: async (rig) => {
      rig.setBreakpoint(['tracker_list_tasks']);
    },
    assert: async (rig) => {
      const confirmation = await rig.waitForPendingConfirmation(
        ['tracker_list_tasks'],
        30000,
      );

      expect(
        confirmation,
        'Expected tracker_list_tasks tool call confirmation',
      ).toBeDefined();
      expect(
        confirmation.toolName,
        'Agent should call tracker_list_tasks to retrieve task list',
      ).toBe('tracker_list_tasks');

      await rig.resolveTool(confirmation);
      await rig.waitForIdle(30000);
    },
  });

  appEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent calls tracker_get_task with created task ID when asked to view details for a task',
    configOverrides: {
      tracker: true,
    },
    prompt:
      'First, create a task titled "Fix authentication bug" in the task tracker. Then immediately retrieve and display the full details of that task using tracker_get_task.',
    setup: async (rig) => {
      rig.setBreakpoint(['tracker_create_task', 'tracker_get_task']);
    },
    assert: async (rig) => {
      const createConfirmation = await rig.waitForPendingConfirmation(
        ['tracker_create_task', 'tracker_get_task'],
        30000,
      );

      expect(
        createConfirmation,
        'Expected tracker_create_task confirmation first',
      ).toBeDefined();
      expect(createConfirmation.toolName).toBe('tracker_create_task');
      await rig.resolveTool(createConfirmation);

      // Wait for tracker_get_task confirmation (signaling create completed and model requested get)
      const getConfirmation = await rig.waitForPendingConfirmation(
        ['tracker_get_task'],
        30000,
      );

      expect(
        getConfirmation,
        'Expected tracker_get_task confirmation after task creation',
      ).toBeDefined();
      expect(getConfirmation.toolName).toBe('tracker_get_task');

      // Inspect completed tracker_create_task call in tool logs
      const toolCalls = (rig as any).getToolCalls();
      const createCall = toolCalls.find(
        (call: any) =>
          call.request?.name === 'tracker_create_task' &&
          (call.status === 'success' || call.response),
      );
      expect(
        createCall,
        'Expected tracker_create_task to complete successfully',
      ).toBeDefined();

      // Extract the created task ID from response content (content / llmContent / output)
      // The tracker tool returns: "Created task <id>: <title>"
      const responseParts = (createCall as any)?.response?.responseParts ?? [];
      const responseText = responseParts
        .map(
          (p: any) =>
            p?.functionResponse?.response?.content ??
            p?.functionResponse?.response?.llmContent ??
            p?.functionResponse?.response?.output ??
            p?.text ??
            '',
        )
        .join('');
      const createdIdMatch = responseText.match(/Created task\s+([^:]+):/);
      const createdTaskId = createdIdMatch?.[1]?.trim();
      expect(
        createdTaskId,
        `Expected to extract created task ID from response: "${responseText}"`,
      ).toBeDefined();

      // Verify tracker_get_task requested ID matches the created task ID
      const getTaskCall = (rig as any)
        .getToolCalls()
        .find((call: any) => call.request?.name === 'tracker_get_task');
      expect(
        getTaskCall,
        'Expected tracker_get_task in tool call logs',
      ).toBeDefined();
      const argsString = (getTaskCall as any)?.request?.args;
      const args = argsString ? JSON.parse(argsString) : undefined;
      const requestedId = args?.taskId ?? args?.id;
      expect(
        typeof requestedId === 'string' && requestedId.length > 0,
        'Expected tracker_get_task to be called with a non-empty string task ID',
      ).toBe(true);
      expect(
        requestedId,
        'tracker_get_task must retrieve the same task that was just created',
      ).toBe(createdTaskId);

      await rig.resolveTool(getConfirmation);
      await rig.waitForIdle(30000);
    },
  });
});
