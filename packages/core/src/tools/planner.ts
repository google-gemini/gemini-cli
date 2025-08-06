/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult, Icon } from './tools.js';
import { Config } from '../config/config.js';
import {
  SubAgentScope,
  SubagentTerminateMode,
  ContextState,
  PromptConfig,
  ModelConfig,
  RunConfig,
  ToolConfig,
  OutputConfig,
} from '../core/subagent.js';
import { LSTool } from './ls.js';
import { GrepTool } from './grep.js';
import { ReadFileTool } from './read-file.js';
import { GlobTool } from './glob.js';
import { ReadManyFilesTool } from './read-many-files.js';
import { Type } from '@google/genai';

/**
 * Parameters for the PlannerTool
 */
export interface PlannerToolParams {
  /**
   * The high-level task or goal the user wants to achieve.
   */
  objective: string;
}

/**
 * A tool that invokes a specialized subagent to generate a detailed plan for a given objective.
 */
export class PlannerTool extends BaseTool<PlannerToolParams, ToolResult> {
  static readonly Name = 'generate_plan';

  /**
   * Creates a new instance of the PlannerTool.
   * @param config Configuration object from the parent agent (used as runtimeContext).
   */
  constructor(private config: Config) {
    super(
      PlannerTool.Name,
      'Generate Plan',
      'Use this tool when the user asks for a plan, a strategy, an approach, or a sequence of steps to accomplish a complex task BEFORE attempting to execute it. This tool analyzes the current environment and the objective to produce a detailed, step-by-step plan.',
      Icon.LightBulb,
      {
        type: Type.OBJECT,
        properties: {
          objective: {
            description:
              'The high-level task or goal the user wants to achieve.',
            type: Type.STRING,
          },
        },
        required: ['objective'],
      },
    );
  }

  /**
   * Executes the planning operation by invoking a subagent.
   * @param params Parameters containing the objective.
   * @param signal AbortSignal.
   * @returns A ToolResult containing the generated plan or an error.
   */
  async execute(
    params: PlannerToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const authType = this.config.getContentGeneratorConfig()?.authType;
    if (!authType) {
      return {
        llmContent:
          'Error: Parent agent is not properly authenticated. Cannot create planner sub-agent.',
        returnDisplay:
          'Error: Parent agent is not properly authenticated. Cannot create planner sub-agent.',
        error: { message: 'Authentication missing for subagent creation.' },
      };
    }

    // Define the Tools available to the Planner (Read-only)
    const observationTools = [
      LSTool.Name,
      GrepTool.Name,
      GlobTool.Name,
      ReadFileTool.Name,
      ReadManyFilesTool.Name,
    ];

    const toolConfig: ToolConfig = {
      tools: observationTools,
    };

    // Define the Prompt for the Planner Subagent
    const promptConfig: PromptConfig = {
      systemPrompt: `
You are an expert planning agent. Your role is to analyze the user's objective and the current environment (filesystem, code) to generate a detailed, actionable, step-by-step plan.

Objective: ${params.objective}

Constraints:
1. You MUST only use the provided tools (${observationTools.join(', ')}) for reconnaissance. You CANNOT modify the environment (no 'edit', 'write', or 'shell').
2. The plan must be grounded in the reality of the current codebase and environment. Do not invent file paths or code structures. Verify existence before relying on it.
3. The plan should be detailed enough for another agent to execute without ambiguity.
4. Prioritize understanding the existing code and conventions before proposing changes.

Workflow:
1. Analyze the Objective: Understand the goal and constraints.
2. Reconnaissance Phase: Use your tools extensively to explore the file structure, identify relevant code snippets, and understand existing patterns.
3. Plan Formulation: Based on the reconnaissance, draft the step-by-step plan.
4. Output Emission: Once the plan is complete, you MUST use 'self.emitvalue' to output the plan under the variable name 'plan'.

The final plan should be formatted in clear Markdown.
`,
    };

    // Define the Expected Outputs
    const outputConfig: OutputConfig = {
      outputs: {
        plan: 'A detailed, markdown-formatted step-by-step plan to achieve the objective.',
      },
    };

    // Define Model Configuration
    const modelConfig: ModelConfig = {
      model: this.config.getModel(),
      temp: 0.1, // Low temperature for deterministic planning
      top_p: 1.0,
    };

    // Define Run Configuration
    const runConfig: RunConfig = {
      max_time_minutes: 5, // Give it enough time to explore and plan
      max_turns: 20, // Limit the back-and-forth during reconnaissance
    };

    try {
      const orchestrator = await SubAgentScope.create(
        'PlannerAgent',
        this.config,
        promptConfig,
        modelConfig,
        runConfig,
        toolConfig,
        outputConfig,
      );

      const context = new ContextState();
      await orchestrator.runNonInteractive(context);

      if (orchestrator.output.terminate_reason === SubagentTerminateMode.GOAL) {
        const plan = orchestrator.output.emitted_vars['plan'];
        if (plan) {
          const displayOutput = `### Generated Plan\n\n${plan}`;
          return {
            llmContent: displayOutput,
            returnDisplay: displayOutput,
            summary: 'Successfully generated a plan.',
          };
        } else {
          // Goal reached but plan was not emitted correctly
          return {
            llmContent:
              'Error: Planner finished successfully but did not emit a plan.',
            returnDisplay:
              'Error: Planner finished successfully but did not emit a plan.',
            error: {
              message: 'Planner subagent failed to emit the "plan" variable.',
            },
          };
        }
      } else {
        // Handle non-successful termination (TIMEOUT, ERROR, MAX_TURNS)
        const errorMessage = `Planner subagent failed to complete. Reason: ${orchestrator.output.terminate_reason}`;
        return {
          llmContent: errorMessage,
          returnDisplay: errorMessage,
          error: { message: errorMessage },
        };
      }
    } catch (error) {
      console.error('PlannerTool execution failed:', error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error: An unexpected error occurred while running the planner: ${errorMessage}`,
        returnDisplay: `Error: An unexpected error occurred while running the planner: ${errorMessage}`,
        error: { message: errorMessage },
      };
    }
  }
}
