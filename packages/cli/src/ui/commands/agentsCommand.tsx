/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
  type SubmitPromptActionReturn,
} from './types.js';
import { MessageType, type HistoryItemAgentsList } from '../types.js';

const AGENT_CONFIGURATOR_PROMPT = `
You are an expert assistant that helps users create new Gemini CLI agents.
Your task is to take a user's description of an agent and generate a valid \`.toml\` configuration file for it.

**Instructions:**

1.  **Understand the User's Goal:** Read the user's description carefully to understand the intended purpose of the agent.
2.  **Generate a Name:** Create a short, descriptive, \`kebab-case\` name for the agent (e.g., \`my-research-agent\`).
3.  **Assign an Icon:** Select a single emoji that best represents the agent's function.
4.  **Write the TOML Configuration:** Generate the complete TOML content. Use the user's description and the name you generated. Use a default model like \`gemini-1.5-flash-latest\` and include a basic \`input_prompt\` in the \`[inputConfig.inputs]\` section.
5.  **Call the \`write_file\` Tool:** You **MUST** use the \`write_file\` tool to save the configuration.
    *   The \`file_path\` **MUST** be \`.gemini/agents/<agent-name>.toml\`.
    *   The \`content\` **MUST** be the full TOML configuration you generated.

**Example User Request:**
"/agents new create a unit-test specialist that focuses on writing high-quality tests for TypeScript code."

**Your Expected Tool Call:**
\`\`\`
<tool_code>
write_file(file_path: ".gemini/agents/unit-test-specialist.toml", content: """
# Gemini Agent Configuration for "Unit-Test Specialist"

name = "unit-test-specialist"
displayName = "Unit-Test Specialist"
icon = "🧪"
description = "A unit-test specialist that focuses on writing high-quality tests for TypeScript code."

[promptConfig]
systemPrompt = """
You are a unit-test specialist. Your task is to write high-quality, comprehensive tests for TypeScript code.
"""

[modelConfig]
model = "gemini-1.5-flash-latest"
temp = 0.5
top_p = 0.9

[runConfig]
max_time_minutes = 5
max_turns = 10

[inputConfig.inputs.input_prompt]
description = "The code to write tests for."
type = "string"
required = true
""")
</tool_code>
\`\`\`

Now, process the following request:
`;

export const agentsCommand: SlashCommand = {
  name: 'agents',
  description: 'Manage local agents.',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'new',
      description: 'Create a new agent.',
      kind: CommandKind.BUILT_IN,
    },
    {
      name: 'list',
      description: 'List available agents (default).',
      kind: CommandKind.BUILT_IN,
    },
  ],
  action: async (
    context: CommandContext,
    args?: string,
  ): Promise<void | SubmitPromptActionReturn> => {
    const subCommand = args?.trim();

    if (subCommand && subCommand.startsWith('new')) {
      const description = subCommand.substring(3).trim();
      if (!description) {
        context.ui.addItem(
          {
            type: MessageType.ERROR,
            text: 'Please provide a description for the agent. Usage: /agents new <description>',
          },
          Date.now(),
        );
        return;
      }
      return {
        type: 'submit_prompt',
        content: AGENT_CONFIGURATOR_PROMPT + description,
      };
    }

    if (
      !subCommand ||
      subCommand === 'list' ||
      subCommand === 'desc' ||
      subCommand === 'descriptions'
    ) {
      const config = context.services.config;
      if (!config) {
        context.ui.addItem(
          {
            type: MessageType.ERROR,
            text: 'Could not retrieve configuration.',
          },
          Date.now(),
        );
        return;
      }

      const agentRegistry = config.getAgentRegistry();
      const agents = agentRegistry.getAllDefinitions();

      const agentsListItem: HistoryItemAgentsList = {
        type: MessageType.AGENTS_LIST,
        agents: agents.map((agent) => ({
          name: agent.name,
          displayName: agent.displayName ?? agent.name,
          description: agent.description,
          icon: agent.icon,
        })),
        showDescriptions: true,
      };

      context.ui.addItem(agentsListItem, Date.now());
    } else {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: `Unknown subcommand: "${subCommand}". Usage: /agents [new|list]`,
        },
        Date.now(),
      );
    }
  },
};
