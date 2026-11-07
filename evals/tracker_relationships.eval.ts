/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { appEvalTest } from './app-test-helper.js';

describe.sequential('tracker_relationships', () => {
  appEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent calls tracker_add_dependency when asked to declare a task dependency relationship',
    configOverrides: {
      tracker: true,
    },
    prompt:
      'First, create a task titled "Backend API" in the task tracker. Then create a second task titled "Frontend UI" and mark "Frontend UI" as depending on "Backend API" using tracker_add_dependency.',
    setup: async (rig) => {
      rig.setBreakpoint(['tracker_create_task', 'tracker_add_dependency']);
    },
    assert: async (rig) => {
      const firstCreate = await rig.waitForPendingConfirmation(
        ['tracker_create_task', 'tracker_add_dependency'],
        30000,
      );
      expect(firstCreate, 'Expected task creation confirmation').toBeDefined();
      if (firstCreate.toolName === 'tracker_create_task') {
        await rig.resolveTool(firstCreate);

        const secondCreate = await rig.waitForPendingConfirmation(
          ['tracker_create_task', 'tracker_add_dependency'],
          30000,
        );
        expect(
          secondCreate,
          'Expected second task creation or dependency confirmation',
        ).toBeDefined();
        if (secondCreate.toolName === 'tracker_create_task') {
          await rig.resolveTool(secondCreate);
        }
      }

      const depConfirmation = await rig.waitForPendingConfirmation(
        ['tracker_add_dependency'],
        30000,
      );

      expect(
        depConfirmation,
        'Expected tracker_add_dependency tool call confirmation',
      ).toBeDefined();
      expect(
        depConfirmation.toolName,
        'Agent should call tracker_add_dependency to declare task dependency',
      ).toBe('tracker_add_dependency');

      await rig.resolveTool(depConfirmation);
      await rig.waitForIdle(30000);
    },
  });

  appEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent calls tracker_visualize when asked to display task dependency graph',
    configOverrides: {
      tracker: true,
    },
    prompt:
      'Display a visual graph or chart representation of all active tasks and their dependencies in the task tracker using tracker_visualize.',
    setup: async (rig) => {
      rig.setBreakpoint(['tracker_visualize']);
    },
    assert: async (rig) => {
      const confirmation = await rig.waitForPendingConfirmation(
        ['tracker_visualize'],
        30000,
      );

      expect(
        confirmation,
        'Expected tracker_visualize tool call confirmation',
      ).toBeDefined();
      expect(
        confirmation.toolName,
        'Agent should call tracker_visualize to display dependency graph',
      ).toBe('tracker_visualize');

      await rig.resolveTool(confirmation);
      await rig.waitForIdle(30000);
    },
  });
});
