/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, Mocked } from 'vitest';
import { getPlanningTool } from './planning-tool.js';
import { SubAgentScope, SubagentTerminateMode } from '../core/subagent.js';
import { Config } from '../config/config.js';
import { AnyDeclarativeTool } from './tools.js';

// Mock the SubAgentScope
vi.mock('../core/subagent.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/subagent.js')>();
  return {
    ...actual,
    SubAgentScope: {
      create: vi.fn(),
    },
  };
});

const mockedSubAgentScope = SubAgentScope as Mocked<typeof SubAgentScope>;

describe('PlanningTool', () => {
  let planningTool: AnyDeclarativeTool;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {} as Config;
    planningTool = getPlanningTool(mockConfig);
    vi.clearAllMocks();
  });

  it('should correctly process a successful plan generation', async () => {
    const mockPlan = {
      task: 'Create a plan',
      description: 'This is a test plan.',
    };
    const mockPlannerAgent = {
      runNonInteractive: vi.fn(),
      output: {
        terminate_reason: SubagentTerminateMode.GOAL,
        emitted_vars: {
          execution_plan: JSON.stringify(mockPlan),
        },
      },
    };
    mockedSubAgentScope.create.mockResolvedValue(
      mockPlannerAgent as unknown as SubAgentScope,
    );

    const params = { user_request: 'Test request' };
    const invocation = planningTool.build(params);
    const result = await invocation.execute(new AbortController().signal);

    expect(SubAgentScope.create).toHaveBeenCalled();
    expect(mockPlannerAgent.runNonInteractive).toHaveBeenCalled();
    expect(result.returnDisplay).toBe(JSON.stringify(mockPlan, null, 2));
    expect(result.llmContent).toEqual([
      {
        functionResponse: {
          name: 'planning_tool',
          response: {
            success: true,
            plan: mockPlan,
          },
        },
      },
    ]);
  });

  it('should handle plan generation failure', async () => {
    const mockPlannerAgent = {
      runNonInteractive: vi.fn(),
      output: {
        terminate_reason: 'ERROR',
        emitted_vars: {},
      },
    };
    mockedSubAgentScope.create.mockResolvedValue(
      mockPlannerAgent as unknown as SubAgentScope,
    );

    const params = { user_request: 'Test request' };
    const invocation = planningTool.build(params);
    const result = await invocation.execute(new AbortController().signal);

    expect(result.returnDisplay).toBe('Failed to create a plan.');
    expect(result.llmContent).toEqual([
      {
        functionResponse: {
          name: 'planning_tool',
          response: {
            success: false,
            error: 'Failed to create a plan.',
          },
        },
      },
    ]);
  });

  it('should handle JSON parsing errors', async () => {
    const mockPlannerAgent = {
      runNonInteractive: vi.fn(),
      output: {
        terminate_reason: SubagentTerminateMode.GOAL,
        emitted_vars: {
          execution_plan: 'not a valid json',
        },
      },
    };
    mockedSubAgentScope.create.mockResolvedValue(
      mockPlannerAgent as unknown as SubAgentScope,
    );

    const params = { user_request: 'Test request' };
    const invocation = planningTool.build(params);
    const result = await invocation.execute(new AbortController().signal);

    expect(result.returnDisplay).toBe('not a valid json');
    expect(result.llmContent).toEqual([
      {
        functionResponse: {
          name: 'planning_tool',
          response: {
            success: false,
            error: 'Invalid JSON response',
          },
        },
      },
    ]);
  });
});
