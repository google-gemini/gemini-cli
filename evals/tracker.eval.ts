/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { ApprovalMode } from '@google/gemini-cli-core';
import { evalTest, assertModelHasOutput } from './test-helper.js';

describe('tracker_mode', () => {
  const TEST_PREFIX = 'Tracker Mode: ';

  // =========================================================================
  // EXPLICIT TRACKER EVALS
  // User explicitly asks the model to use the tracker
  // =========================================================================

  evalTest('USUALLY_PASSES', {
    name: 'should initialize the tracker when explicitly requested',
    approvalMode: ApprovalMode.YOLO,
    prompt: 'Please start tracking tasks for this project.',
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('tracker_init');
      expect(wasToolCalled, 'Expected tracker_init tool to be called').toBe(
        true,
      );
      assertModelHasOutput(result);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should create a task when explicitly given a bug report to track',
    approvalMode: ApprovalMode.YOLO,
    prompt: 'We have a new bug: the login page crashes on mobile. Please track it.',
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('tracker_create_task');
      expect(
        wasToolCalled,
        'Expected tracker_create_task tool to be called',
      ).toBe(true);

      const toolLogs = rig.readToolLogs();
      const createCall = toolLogs.find(
        (log) => log.toolRequest.name === 'tracker_create_task',
      );
      expect(createCall).toBeDefined();

      if (createCall) {
        const args = JSON.parse(createCall.toolRequest.args);
        expect(args.type).toBe('bug');
        // Validate it captured some details from the prompt
        expect(args.title?.toLowerCase() || args.description?.toLowerCase()).toContain('login');
      }
      
      assertModelHasOutput(result);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should visualize or list tasks when requested for an overview',
    approvalMode: ApprovalMode.YOLO,
    prompt: 'Show me an overview of all our current tasks.',
    assert: async (rig, result) => {
      // Due to model flakiness, it might choose visualize OR list_tasks. Both are acceptable.
      let listCalled = false;
      let visualizeCalled = false;
      
      try {
        listCalled = await rig.waitForToolCall('tracker_list_tasks', 10000);
      } catch (e) {
        // timeout, ignore
      }
      
      try {
        if (!listCalled) {
             visualizeCalled = await rig.waitForToolCall('tracker_visualize', 10000);
        }
      } catch (e) {
          // timeout, ignore
      }

      const toolLogs = rig.readToolLogs();
      const relevantCall = toolLogs.find(
        (log) => ['tracker_list_tasks', 'tracker_visualize'].includes(log.toolRequest.name)
      );

      expect(relevantCall, 'Expected tracker_list_tasks or tracker_visualize to be called').toBeDefined();
      assertModelHasOutput(result);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should update a task status when requested',
    approvalMode: ApprovalMode.YOLO,
    prompt: 'Mark task abcdef as in progress.',
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('tracker_update_task');
      expect(
        wasToolCalled,
        'Expected tracker_update_task tool to be called',
      ).toBe(true);
      
      const toolLogs = rig.readToolLogs();
      const updateCall = toolLogs.find(
        (log) => log.toolRequest.name === 'tracker_update_task',
      );
      expect(updateCall).toBeDefined();

      if (updateCall) {
        const args = JSON.parse(updateCall.toolRequest.args);
        expect(args.id).toBe('abcdef');
        expect(args.status).toBe('in_progress');
      }

      assertModelHasOutput(result);
    },
  });

  // =========================================================================
  // IMPLICIT TRACKER EVALS
  // Model should decide to use the tracker without explicit instructions
  // =========================================================================

  evalTest('USUALLY_PASSES', {
    name: 'should implicitly create tasks when asked to build a feature plan',
    approvalMode: ApprovalMode.YOLO,
    prompt: 'I need to build a complex new feature for user authentication. Create a detailed implementation plan and organize the work into bite-sized chunks.',
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

      assertModelHasOutput(result);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should implicitly initialize tracker when starting a new project',
    approvalMode: ApprovalMode.YOLO,
    prompt: 'Lets start building a new web app from scratch. Set up the environment and organize the initial tasks we need to do.',
    assert: async (rig, result) => {
        
      try {
           // It might initialize it if it feels doing so sets up the environment properly
          await rig.waitForToolCall('tracker_init', 15000); 
      } catch(e) {
          // ignore error
      }
      
      // Or it might just start creating tasks, which implicitly initializes it depending on the system's setup or how the model thinks about it, but verifying `tracker_init` is a good implicit behavior target.
      const toolLogs = rig.readToolLogs();
      const trackerInitCall = toolLogs.find(
        (log) => log.toolRequest.name === 'tracker_init',
      );
      const trackerCreateCall = toolLogs.find(
          (log) => log.toolRequest.name === 'tracker_create_task',
        );

      expect(trackerInitCall || trackerCreateCall, 'Expected the model to autonomously initialize the tracker or start creating tasks for the setup phase').toBeDefined();
      
      assertModelHasOutput(result);
    },
  });

});
