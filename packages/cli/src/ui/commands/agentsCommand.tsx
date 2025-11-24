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
import * as fs from 'node:fs/promises';
import { getErrorMessage } from '../../utils/errors.js';

const AGENT_CONFIGURATOR_PROMPT = `
You are an expert assistant that helps users create new Gemini CLI agents.
Your task is to take a user's description of an agent, expand upon it to create a rich system prompt, and generate a valid \`.toml\` configuration file with sane defaults.

**Instructions:**

1.  **Analyze the User's Goal:** Read the user's description carefully to understand the intended purpose of the agent.
2.  **Generate Core Details:**
    *   **Name:** Create a short, descriptive, \`kebab-case\` name (e.g., \`my-research-agent\`).
    *   **Display Name:** Create a human-readable title (e.g., "My Research Agent").
    *   **Icon:** Select a single emoji that best represents the agent's function.
    *   **Description:** Write a clear, one-sentence summary of the agent's purpose. This should be an improvement on the user's input, not just a copy.
3.  **Create a Rich System Prompt:** Based on the user's description, write a detailed \`systemPrompt\`. Go beyond the user's simple request. Add context, define the agent's persona, and provide clear instructions or rules for how it should behave to be most effective at its task.
4.  **Set Intelligent Defaults:** Analyze the user's description for its primary function.
    *   **For Planning/Reasoning Agents** (tasks involving analysis, investigation, complex reasoning): Use a powerful model like \`gemini-1.5-pro-latest\`, a higher turn limit (\`max_turns = 15\`), and a longer timeout (\`max_time_minutes = 5\`).
    *   **For Execution Agents** (tasks involving writing code, running commands, simple transformations): Use a faster, more cost-effective model like \`gemini-1.5-flash-latest\`, a lower turn limit (\`max_turns = 5\`), and a shorter timeout (\`max_time_minutes = 2\`).
5.  **Generate the TOML:** Assemble the full configuration. Include a basic \`input_prompt\` in the \`[inputConfig.inputs]\` section.
6.  **Call the \`write_file\` Tool:** You **MUST** use the \`write_file\` tool to save the configuration.
    *   The \`file_path\` **MUST** be \`.gemini/agents/<agent-name>.toml\`.
    *   The \`content\` **MUST** be the full TOML configuration you generated.
7.  **Provide Usage Instructions:** After saving the file, tell the user they can use the new agent by asking Gemini to use it (e.g., "Use the <agent-name> agent to..."). Do NOT invent slash commands like \`/agent:name\`.

**Example User Request:**
"/agents new create a unit-test specialist that focuses on writing high-quality tests for TypeScript code."

**(Your internal reasoning should be: "This is an execution task, so I'll use Flash and shorter limits.")**

**Your Expected Tool Call:**
\`\`\`
<tool_code>
write_file(file_path: ".gemini/agents/unit-test-specialist.toml", content: """
# Gemini Agent Configuration for "Unit-Test Specialist"
... (content omitted for brevity) ...
""")
</tool_code>
\`\`\`

**Your Final Response:**
"I have created the **Unit-Test Specialist** agent. You can now use it by asking me: 'Use the unit-test specialist to write tests for this file.'"

Now, process the following request:
`;

async function listAction(context: CommandContext) {
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
}

function newAction(
  context: CommandContext,
  args?: string,
): SubmitPromptActionReturn | void {
  const description = args?.trim();
  if (!description) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Please provide a description for the new agent. Usage: /agents new <description>',
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

const listAgentsCommand: SlashCommand = {
  name: 'list',
  description: 'List available agents.',
  kind: CommandKind.BUILT_IN,
  action: listAction,
};

const newAgentCommand: SlashCommand = {
  name: 'new',
  description: 'Create a new agent.',
  kind: CommandKind.BUILT_IN,
  action: newAction,
};

async function descAction(context: CommandContext, args?: string) {
  const agentName = args?.trim();
  if (!agentName) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Please specify an agent name. Usage: /agents desc <agent-name>',
      },
      Date.now(),
    );
    return;
  }

  const config = context.services.config;
  if (!config) {
    context.ui.addItem(
      { type: MessageType.ERROR, text: 'Could not retrieve configuration.' },
      Date.now(),
    );
    return;
  }

  const agent = config.getAgentRegistry().getDefinition(agentName);

  if (!agent || !agent.filePath) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: `Agent "${agentName}" not found or its file path is missing.`,
      },
      Date.now(),
    );
    return;
  }

  try {
    const tomlContent = await fs.readFile(agent.filePath, 'utf-8');
    const displayContent = `
**File Path:** \`${agent.filePath}\`

**Configuration:**
\`\`\`toml
${tomlContent}
\`\`\`
`;
    context.ui.addItem(
      { type: MessageType.INFO, text: displayContent },
      Date.now(),
    );
  } catch (e) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: `Error reading agent file: ${getErrorMessage(e)}`,
      },
      Date.now(),
    );
  }
}

const descAgentCommand: SlashCommand = {
  name: 'desc',
  description: 'Describe a configured agent.',
  kind: CommandKind.BUILT_IN,
  action: descAction,
  completion: (context) => {
    const agentRegistry = context.services.config?.getAgentRegistry();
    if (!agentRegistry) return [];
    return agentRegistry.getAllDefinitions().map((def) => def.name);
  },
};

export const agentsCommand: SlashCommand = {
  name: 'agents',
  description: 'Manage local agents.',
  kind: CommandKind.BUILT_IN,
  subCommands: [newAgentCommand, listAgentsCommand, descAgentCommand],
  action: (context, args) => {
    const parts = args?.trim().split(' ') ?? [];
    const subCommand = parts[0] || '';
    const subCommandArgs = parts.slice(1).join(' ');

    switch (subCommand) {
      case 'new':
        return newAgentCommand.action!(context, subCommandArgs);
      case 'list':
      case '':
        return listAgentsCommand.action!(context, subCommandArgs);
      case 'desc':
        return descAgentCommand.action!(context, subCommandArgs);
      default:
        context.ui.addItem(
          {
            type: MessageType.ERROR,
            text: `Unknown subcommand: "${subCommand}". Valid subcommands are "new", "list", and "desc".`,
          },
          Date.now(),
        );
    }
  },
};
