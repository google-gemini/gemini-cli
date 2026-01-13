/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LocalAgentDefinition } from './types.js';
import { z } from 'zod';
import type { Config } from '../config/config.js';
import {
  ALL_BUILTIN_TOOL_NAMES,
  DELEGATE_TO_AGENT_TOOL_NAME,
  EDIT_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  MEMORY_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  SHELL_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
} from '../tools/tool-names.js';

// Simple output schema - just a string result
const GeneralSubagentOutputSchema = z.object({
  result: z.string().describe('The final result or output from the task.'),
});

// All tools available to the general subagent - all builtin tools except delegate_to_agent
// to prevent infinite recursion. Tools are resolved at execution time from parent registry.
const GENERAL_SUBAGENT_TOOLS = ALL_BUILTIN_TOOL_NAMES.filter(
  (name) => name !== DELEGATE_TO_AGENT_TOOL_NAME,
);

// Static system prompt for the general subagent - avoids calling getCoreSystemPrompt
// which requires the tool registry to be initialized
const GENERAL_SUBAGENT_SYSTEM_PROMPT = `You are a general-purpose AI assistant specialized in software engineering tasks.
Your primary goal is to help complete the assigned task safely and efficiently.

# Core Mandates

- **Conventions:** Rigorously adhere to existing project conventions when reading or modifying code.
- **Libraries/Frameworks:** NEVER assume a library/framework is available. Verify its usage within the project first.
- **Style & Structure:** Mimic the style, structure, and patterns of existing code in the project.
- **Idiomatic Changes:** Ensure your changes integrate naturally and idiomatically.
- **Proactiveness:** Fulfill the task thoroughly, including adding tests when appropriate.

# Primary Workflow

1. **Understand:** Use '${GREP_TOOL_NAME}' and '${GLOB_TOOL_NAME}' to understand file structures and code patterns.
   Use '${READ_FILE_TOOL_NAME}' to understand context. Make parallel calls when reading multiple files.
2. **Plan:** Build a coherent plan based on your understanding. Use iterative development with tests.
3. **Implement:** Use '${EDIT_TOOL_NAME}', '${WRITE_FILE_TOOL_NAME}', '${SHELL_TOOL_NAME}' to implement changes.
4. **Verify:** Run tests and linting/type-checking commands to ensure code quality.

# Guidelines

- Be concise and direct. Focus on the task.
- Use tools for actions, text only for communication.
- Execute multiple independent tool calls in parallel.
- Use '${MEMORY_TOOL_NAME}' only for user-specific facts that should persist.
- Always prioritize security. Never expose secrets or sensitive information.

When finished, provide a clear summary of what was accomplished.`;

/**
 * A general-purpose subagent that is an exact copy of the main Gemini CLI agent.
 * It inherits all tools, model configuration, and system prompt from the main agent.
 */
export function createGeneralSubagent(
  config: Config,
): LocalAgentDefinition<typeof GeneralSubagentOutputSchema> {
  return {
    name: 'general_subagent',
    kind: 'local',
    displayName: 'General Subagent',
    description: `A general-purpose subagent that is an exact copy of the main Gemini CLI agent. 
      It has access to all the same tools and capabilities as the main agent. 
      Use this subagent for any task that requires the full capabilities of Gemini CLI.`,
    inputConfig: {
      inputs: {
        task: {
          description: `The task or objective to accomplish. 
            Provide a clear and detailed description of what needs to be done.`,
          type: 'string',
          required: true,
        },
      },
    },
    outputConfig: {
      outputName: 'result',
      description: 'The final result or output from completing the task.',
      schema: GeneralSubagentOutputSchema,
    },
    processOutput: (output) => output.result,

    // Inherit model from main agent (or use 'inherit' if supported)
    modelConfig: {
      model: config.getModel(), // Use the same model as main agent
      temp: 0.7, // Default temperature, can be overridden via settings
      top_p: 0.95,
      thinkingBudget: -1, // Use default thinking budget
    },

    runConfig: {
      max_time_minutes: 30, // Reasonable default, can be adjusted
      max_turns: 100, // Same as main agent's MAX_TURNS
    },

    // Give access to all builtin tools (same as main agent, minus delegate_to_agent)
    toolConfig: {
      tools: [...GENERAL_SUBAGENT_TOOLS],
    },

    promptConfig: {
      // Use a static system prompt to avoid dependency on tool registry
      systemPrompt: GENERAL_SUBAGENT_SYSTEM_PROMPT,
      query: `Complete the following task:
<task>
\${task}
</task>`,
    },
  };
}
