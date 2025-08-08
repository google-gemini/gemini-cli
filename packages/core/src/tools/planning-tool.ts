/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, Icon, ToolResult } from './tools.js';
import { Schema, Type } from '@google/genai';
import { Config } from '../config/config.js';
import {
  ContextState,
  ModelConfig,
  OutputConfig,
  PromptConfig,
  RunConfig,
  SubAgentScope,
  SubagentTerminateMode,
  ToolConfig,
} from '../core/subagent.js';
import { GlobTool } from './glob.js';
import { GrepTool } from './grep.js';
import { ReadFileTool } from './read-file.js';
import { ReadManyFilesTool } from './read-many-files.js';
import { LSTool } from './ls.js';

const planningToolName = 'planning_tool';

const PLANNING_SYSTEM_PROMPT = `
You are an expert planning assistant. Your purpose is to take a user's request and decompose it into a detailed, step-by-step execution plan. This plan will be executed by another AI agent, so it must be precise, unambiguous, and structured as a JSON object.

Analyze the user's request carefully. Before creating the plan, you should use the available tools to understand the codebase. Look for relevant files, understand the project structure, and identify existing conventions.

Once you have enough information, create a plan as a JSON object. The plan should be an array of "steps". Each step must be a discrete, actionable task.

The JSON schema for the plan should be:
{
  "plan": [
    {
      "id": "string (unique identifier for the step, e.g., 'step_1')",
      "description": "string (a clear and concise description of what this step does)",
      "type": "string (e.g., 'execute_tool', 'human_review')",
      "tool_call": {
        "tool_name": "string (the name of the tool to execute, e.g., 'run_shell_command', 'write_file')",
        "parameters": "object (the parameters for the tool call)"
      },
      "dependencies": "array of strings (list of step IDs that must be completed before this one)",
      "expected_outcome": "string (a description of the expected state after this step is successfully executed)"
    }
  ]
}

For each step, provide the following:
- **id**: A unique identifier for the step (e.g., "step_1", "read_main_file").
- **description**: A clear and concise description of what needs to be done.
- **type**: The type of task. Use 'execute_tool' for automated tasks. Use 'human_review' if you need the user to review something before proceeding.
- **tool_call**: An object describing the tool to be used.
  - **tool_name**: The name of the tool to execute (e.g., 'run_shell_command', 'write_file', 'read_file', 'glob').
  - **parameters**: An object containing the parameters for the tool. For example, for 'write_file', this would include 'file_path' and 'content'.
- **dependencies**: A list of step 'id's that must be completed before this step can be executed. Use an empty array for steps that can run immediately.
- **expected_outcome**: A brief description of what should be true after the step is completed. This helps in verifying the plan's execution.

Example of a step:
{
  "id": "step_1_read_package_json",
  "description": "Read the package.json file to identify project dependencies and scripts.",
  "type": "execute_tool",
  "tool_call": {
    "tool_name": "read_file",
    "parameters": {
      "absolute_path": "/path/to/project/package.json"
    }
  },
  "dependencies": [],
  "expected_outcome": "The contents of package.json are available for inspection."
}

Here is the user's request:
\${user_request}
`;

const promptConfig: PromptConfig = {
  systemPrompt: PLANNING_SYSTEM_PROMPT,
};

const modelConfig: ModelConfig = {
  model: 'gemini-2.5-pro',
  temp: 0.1,
  top_p: 0.95,
};

const runConfig: RunConfig = {
  max_time_minutes: 10,
  max_turns: 100,
};

const outputConfig: OutputConfig = {
  outputs: {
    execution_plan:
      'A JSON string representing the detailed, step-by-step execution plan. The JSON should conform to the schema specified in the system prompt.',
  },
};

const PlanningToolSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    user_request: {
      type: Type.STRING,
      description: 'The high-level user request to be planned.',
    },
  },
  required: ['user_request'],
};

class PlanningTool extends BaseTool<{ user_request: string }> {
  constructor(private readonly runtimeContext: Config) {
    super(
      planningToolName,
      'Planning Tool',
      'Generates a detailed, step-by-step execution plan from a high-level user request. Use this tool to break down complex tasks into a series of smaller, manageable steps.',
      Icon.LightBulb,
      PlanningToolSchema,
      true, // isOutputMarkdown
      true, // canUpdateOutput
    );
  }

  async execute(
    params: { user_request: string },
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const plan = await this.createPlan(params.user_request, updateOutput);
    const failureMessage = 'Failed to create a plan.';

    if (!plan) {
      return {
        llmContent: [
          {
            functionResponse: {
              name: planningToolName,
              response: { success: false, error: failureMessage },
            },
          },
        ],
        returnDisplay: failureMessage,
      };
    }

    try {
      // For display, format the JSON nicely.
      const parsedPlan = JSON.parse(plan);
      const formattedPlan = JSON.stringify(parsedPlan, null, 2);
      return {
        // For the model, send the raw plan.
        llmContent: [
          {
            functionResponse: {
              name: planningToolName,
              response: { success: true, plan: parsedPlan },
            },
          },
        ],
        returnDisplay: formattedPlan,
      };
    } catch (error) {
      // If parsing fails, it's not a JSON plan. Return as is.
      console.error('Planning tool did not return valid JSON:', error);
      return {
        llmContent: [
          {
            functionResponse: {
              name: planningToolName,
              response: { success: false, error: 'Invalid JSON response' },
            },
          },
        ],
        returnDisplay: plan,
      };
    }
  }

  private async createPlan(
    userRequest: string,
    onMessage?: (message: string) => void,
  ): Promise<string | null> {
    try {
      const toolConfig: ToolConfig = {
        tools: [
          new ReadFileTool(this.runtimeContext),
          new ReadManyFilesTool(this.runtimeContext),
          new GrepTool(this.runtimeContext),
          new GlobTool(this.runtimeContext),
          new LSTool(this.runtimeContext),
        ],
      };
      const plannerAgent = await SubAgentScope.create(
        'planning-subagent',
        this.runtimeContext,
        promptConfig,
        modelConfig,
        runConfig,
        { outputConfig, onMessage, toolConfig },
      );

      const context = new ContextState();
      context.set('user_request', userRequest);

      await plannerAgent.runNonInteractive(context);

      if (plannerAgent.output.terminate_reason === SubagentTerminateMode.GOAL) {
        return plannerAgent.output.emitted_vars['execution_plan'] || null;
      }

      console.error(
        `Planning sub-agent terminated unexpectedly with reason: ${plannerAgent.output.terminate_reason}`,
      );
      return null;
    } catch (error) {
      console.error('An error occurred while running the PlanningTool:', error);
      return null;
    }
  }
}

export function getPlanningTool(
  runtimeContext: Config,
): BaseTool<{ user_request: string }> {
  return new PlanningTool(runtimeContext);
}
