/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  Kind,
  ToolResult,
  ToolInvocation,
  AnyDeclarativeTool,
} from './tools.js';
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
You are a meticulous and expert software engineering assistant. Your primary function is to analyze a user's request and decompose it into a detailed, step-by-step execution plan. This plan will be executed by another AI agent, so it must be precise, unambiguous, and structured as a valid JSON object.

**Core Objective:** Create a comprehensive and executable plan to fulfill the user's request.

**Phase 1: Context Gathering & Analysis (CRITICAL)**

Before generating the plan, you MUST thoroughly understand the user's request and the project's context. Your initial steps should ALWAYS involve using the available discovery tools to:
1.  **Explore the codebase:** Use tools like 'ls', 'glob', and 'grep' to find relevant files and understand the project structure.
2.  **Read file contents:** Use 'read_file' and 'read_many_files' to analyze existing code, identify conventions (styling, naming, architecture), and find the exact locations for new code or modifications.
3.  **Formulate a strategy:** Based on your analysis, decide on the best approach to implement the user's request.

**Available Discovery Tools:**
- 'ls': List files and directories.
- 'glob': Find files matching a pattern.
- 'grep': Search for content within files.
- 'read_file': Read the content of a single file.
- 'read_many_files': Read the content of multiple files at once.

**Phase 2: Plan Generation**

Once you have gathered sufficient context, construct the execution plan as a JSON object. Adhere strictly to the schema provided below.

**Principles of a Good Plan:**
- **Atomicity:** Each step should represent a single, discrete task. Avoid combining multiple actions into one step.
- **Clarity:** Descriptions and expected outcomes must be clear and unambiguous.
- **Dependencies:** Correctly map dependencies between steps. A step should only depend on steps whose output is directly required for it to run.
- **Safety:** If a step involves a significant change or deletion, or if you are uncertain about the best approach, insert a 'human_review' step to get user confirmation.

**JSON Plan Schema:**
{
  "plan": [
    {
      "id": "string (unique identifier for the step, e.g., 'step_1_read_files')",
      "description": "string (A clear and concise description of what this step does and why)",
      "type": "string ('execute_tool' or 'human_review')",
      "tool_call": {
        "tool_name": "string (The name of the tool to execute, e.g., 'write_file', 'replace', 'read_file')",
        "parameters": "object (The parameters for the tool call)"
      },
      "dependencies": "array of strings (List of step IDs that must be completed before this one)",
      "expected_outcome": "string (A description of the expected state after this step is successfully executed)"
    }
  ]
}

**Detailed Field Explanations:**
- **id**: A unique, descriptive identifier (e.g., "step_1_read_package_json", "step_2_add_dependency").
- **description**: Explain what the step does and *why* it's necessary for the overall plan.
- **type**:
    - 'execute_tool': For automated tasks using tools like 'write_file', 'replace', etc. (Note: The planning agent only has discovery tools, but the final plan will be executed by an agent with access to modification tools).
    - 'human_review': Use this to pause execution and ask the user for confirmation or input. The 'description' for this step should be the question you want to ask the user.
- **tool_call**:
    - **tool_name**: The name of the tool to be executed in the final plan. This can include file system modification tools like 'write_file' or 'replace'.
    - **parameters**: A valid object of parameters for the specified tool.
- **dependencies**: An array of 'id's. If empty, the step can be executed immediately.
- **expected_outcome**: A brief, verifiable statement of what should be true after the step completes.

**Example of a Multi-Step Plan:**

*User Request: "Add a new function 'greet(name)' to 'utils.js' and call it from 'main.js'."*

\`\`\`json
{
  "plan": [
    {
      "id": "step_1_read_utils",
      "description": "Read the contents of utils.js to understand its structure and existing functions.",
      "type": "execute_tool",
      "tool_call": {
        "tool_name": "read_file",
        "parameters": {
          "absolute_path": "/path/to/project/utils.js"
        }
      },
      "dependencies": [],
      "expected_outcome": "The content of utils.js is available for analysis."
    },
    {
      "id": "step_2_add_greet_function",
      "description": "Add the new greet(name) function to the end of utils.js.",
      "type": "execute_tool",
      "tool_call": {
        "tool_name": "replace",
        "parameters": {
          "file_path": "/path/to/project/utils.js",
          "old_string": "// End of file",
          "new_string": "function greet(name) {\n  console.log('Hello, ' + name + '!');\n}\n// End of file"
        }
      },
      "dependencies": ["step_1_read_utils"],
      "expected_outcome": "The file utils.js now contains the greet function."
    },
    {
      "id": "step_3_read_main",
      "description": "Read the contents of main.js to determine where to call the new function.",
      "type": "execute_tool",
      "tool_call": {
        "tool_name": "read_file",
        "parameters": {
          "absolute_path": "/path/to/project/main.js"
        }
      },
      "dependencies": [],
      "expected_outcome": "The content of main.js is available for analysis."
    },
    {
      "id": "step_4_call_greet_function",
      "description": "Import and call the greet function from main.js.",
      "type": "execute_tool",
      "tool_call": {
        "tool_name": "replace",
        "parameters": {
          "file_path": "/path/to/project/main.js",
          "old_string": "// Call functions here",
          "new_string": "import { greet } from './utils.js';\n\ngreet('World');\n// Call functions here"
        }
      },
      "dependencies": ["step_2_add_greet_function", "step_3_read_main"],
      "expected_outcome": "main.js now imports and calls the greet function."
    }
  ]
}
\`\`\`

Now, begin your analysis for the following user request.
Remember to use your discovery tools first.

**User Request:**
\${user_request}
`;

const promptConfig: PromptConfig = {
  systemPrompt: PLANNING_SYSTEM_PROMPT,
};

import { DEFAULT_GEMINI_MODEL } from '../config/models.js';

const modelConfig: ModelConfig = {
  model: DEFAULT_GEMINI_MODEL,
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

const PlanningToolSchema = {
  type: 'object',
  properties: {
    user_request: {
      type: 'string',
      description: 'The high-level user request to be planned.',
    },
  },
  required: ['user_request'],
};

class PlanningTool extends BaseDeclarativeTool<
  { user_request: string },
  ToolResult
> {
  constructor(private readonly runtimeContext: Config) {
    super(
      planningToolName,
      'Planning Tool',
      'For complex, multi-step tasks, use this tool to generate a detailed, step-by-step execution plan. This tool is ideal for creating plans that involve file modifications or other actions requiring a precise sequence of operations. The output is a structured JSON plan that another agent will execute, ensuring all steps are performed correctly and in the right order.',
      Kind.Think,
      PlanningToolSchema,
      true, // isOutputMarkdown
      true, // canUpdateOutput
    );
  }

  protected createInvocation(params: {
    user_request: string;
  }): ToolInvocation<{ user_request: string }, ToolResult> {
    return {
      params,
      getDescription: () =>
        `Generate a detailed execution plan for: ${params.user_request}`,
      toolLocations: () => [],
      shouldConfirmExecute: async () => false,
      execute: async (
        signal: AbortSignal,
        updateOutput?: (output: string) => void,
      ) => this.execute(params, signal, updateOutput),
    };
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

export function getPlanningTool(runtimeContext: Config): AnyDeclarativeTool {
  return new PlanningTool(runtimeContext);
}
