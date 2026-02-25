/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { ApprovalMode, PlanLevel } from '@google/gemini-cli-core';
import { evalTest } from './test-helper.js';
import {
  assertModelHasOutput,
  checkModelOutputContent,
} from './test-helper.js';

function hasLevel(expected: PlanLevel): (args: string) => boolean {
  return (args: string) => {
    try {
      return JSON.parse(args).level === expected;
    } catch {
      return false;
    }
  };
}

describe('plan_mode', () => {
  const TEST_PREFIX = 'Plan Mode: ';
  const settings = {
    experimental: { plan: true },
  };

  evalTest('USUALLY_PASSES', {
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

  evalTest('USUALLY_PASSES', {
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

      // It should NOT write to the docs folder or any other repo path
      const hasRepoWrite = writeTargets.some(
        (path) => path && !path.includes('/plans/'),
      );
      expect(
        hasRepoWrite,
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
      assertModelHasOutput(result);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should allow file modification in plans directory when in plan mode',
    approvalMode: ApprovalMode.PLAN,
    params: {
      settings,
    },
    prompt: 'Create a plan for a new login feature.',
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

  // --- Complexity selection evals ---

  evalTest('USUALLY_PASSES', {
    name: 'should select minimal level for a single-file rename',
    approvalMode: ApprovalMode.DEFAULT,
    params: {
      settings,
    },
    files: {
      'src/utils.ts':
        'export function calculateTotal(items: number[]): number {\n  return items.reduce((sum, item) => sum + item, 0);\n}\n',
    },
    prompt:
      'Rename the function calculateTotal to computeSum in src/utils.ts. Plan the change first.',
    assert: async (rig) => {
      const wasCalled = await rig.waitForToolCall(
        'enter_plan_mode',
        undefined,
        hasLevel(PlanLevel.MINIMAL),
      );
      expect(
        wasCalled,
        `Expected enter_plan_mode with level="${PlanLevel.MINIMAL}"`,
      ).toBe(true);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should select standard level for a typical feature',
    approvalMode: ApprovalMode.DEFAULT,
    params: {
      settings,
    },
    files: {
      'src/app.ts':
        'export class App {\n  start() { console.log("started"); }\n}\n',
      'src/config.ts': 'export const config = { port: 3000 };\n',
    },
    prompt:
      'Add a health check endpoint that returns the app version and uptime. Plan this feature.',
    assert: async (rig) => {
      const wasCalled = await rig.waitForToolCall(
        'enter_plan_mode',
        undefined,
        hasLevel(PlanLevel.STANDARD),
      );
      expect(
        wasCalled,
        `Expected enter_plan_mode with level="${PlanLevel.STANDARD}"`,
      ).toBe(true);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should select thorough level for an architectural redesign',
    approvalMode: ApprovalMode.DEFAULT,
    params: {
      settings,
    },
    files: {
      'src/auth/login.ts':
        'export function login(user: string, pass: string) { return true; }\n',
      'src/auth/session.ts':
        'export function createSession() { return { id: "abc" }; }\n',
      'src/db/users.ts':
        'export function getUser(id: string) { return { id, name: "test" }; }\n',
      'src/api/routes.ts':
        'export const routes = ["/login", "/logout", "/dashboard"];\n',
      'src/middleware/auth.ts':
        'export function authMiddleware(req: any) { return true; }\n',
    },
    prompt:
      'Redesign the authentication system to replace the current session-based auth with JWT tokens. This affects the login flow, session management, user database queries, API routes, and auth middleware. Plan this architectural change.',
    assert: async (rig) => {
      const wasCalled = await rig.waitForToolCall(
        'enter_plan_mode',
        undefined,
        hasLevel(PlanLevel.THOROUGH),
      );
      expect(
        wasCalled,
        `Expected enter_plan_mode with level="${PlanLevel.THOROUGH}"`,
      ).toBe(true);
    },
  });
});
