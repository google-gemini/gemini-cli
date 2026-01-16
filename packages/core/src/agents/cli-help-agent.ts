/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentDefinition } from './types.js';
import { GEMINI_MODEL_ALIAS_FLASH } from '../config/models.js';
import { z } from 'zod';
import type { Config } from '../config/config.js';
import { GetInternalDocsTool } from '../tools/get-internal-docs.js';

const CliHelpReportSchema = z.object({
  answer: z
    .string()
    .describe('The detailed answer to the user question about Gemini CLI.'),
  sources: z
    .array(z.string())
    .describe('The documentation files used to answer the question.'),
});

/**
 * An agent specialized in answering questions about Gemini CLI itself,
 * using its own documentation and runtime state.
 */
export const CliHelpAgent = (
  config: Config,
): AgentDefinition<typeof CliHelpReportSchema> => ({
  name: 'cli_help',
  kind: 'local',
  displayName: 'CLI Help Agent',
  description:
    'Specialized in answering questions about how users use you, (Gemini CLI): features, documentation, and current runtime configuration.',
  inputConfig: {
    inputs: {
      question: {
        description: 'The specific question about Gemini CLI.',
        type: 'string',
        required: true,
      },
    },
  },
  outputConfig: {
    outputName: 'report',
    description: 'The final answer and sources as a JSON object.',
    schema: CliHelpReportSchema,
  },

  processOutput: (output) => JSON.stringify(output, null, 2),

  modelConfig: {
    model: GEMINI_MODEL_ALIAS_FLASH,
    generateContentConfig: {
      temperature: 0.1,
      topP: 0.95,
      thinkingConfig: {
        includeThoughts: true,
        thinkingBudget: -1,
      },
    },
  },

  runConfig: {
    maxTimeMinutes: 3,
    maxTurns: 10,
  },

  toolConfig: {
    tools: [new GetInternalDocsTool(config.getMessageBus())],
  },

  promptConfig: {
    query:
      'Your task is to answer the following question about Gemini CLI:\n' +
      '<question>\n' +
      '${question}\n' +
      '</question>',
    systemPrompt:
      "You are **CLI Help Agent**, an expert on Gemini CLI. Your purpose is to provide accurate information about Gemini CLI's features, configuration, and current state.\n\n" +
      '### Runtime Context\n' +
      '- **CLI Version:** ${cliVersion}\n' +
      '- **Active Model:** ${activeModel}\n' +
      "- **Today's Date:** ${today}\n\n" +
      (config.isAgentsEnabled()
        ? '### Sub-Agents (Local & Remote)\n' +
          "User defined sub-agents are defined in `.gemini/agents/` or `~/.gemini/agents/` as .md files. **CRITICAL:** These files **MUST** start with YAML frontmatter enclosed in triple-dashes `---`, for example:\n\n```yaml\n---\nname: my-agent\n---\n```\n\nWithout this mandatory frontmatter, the agent will not be discovered or loaded by Gemini CLI. The Markdown body following the frontmatter becomes the agent's system prompt (`system_prompt`). Always reference the types and properties outlined here directly when answering questions about sub-agents.\n" +
          '- **Local Agent:** `kind = "local"`, `name`, `description`, `system_prompt`, and optional `tools`, `model`, `temperate`, `max_turns`, `timeout_mins`.\n' +
          '- **Remote Agent (A2A):** `kind = "remote"`, `name`, `agent_card_url`. Remote Agents do not use `system_prompt`. Multiple remote agents can be defined by using a YAML array at the top level of the frontmatter. **Note:** When users ask about "remote agents", they are referring to this Agent2Agent functionality, which is completely distinct from MCP servers.\n' +
          '- **Agent Names:** Must be valid slugs (lowercase letters, numbers, hyphens, and underscores only).\n' +
          '- **User Commands:** The user can manage agents using `/agents list` to see all available agents and `/agents refresh` to reload the registry after modifying definition files. You (the agent) cannot run these commands.\n\n'
        : '') +
      '### Instructions\n' +
      "1. **Explore Documentation**: Use the `get_internal_docs` tool to find answers. If you don't know where to start, call `get_internal_docs()` without arguments to see the full list of available documentation files.\n" +
      '2. **Be Precise**: Use the provided runtime context and documentation to give exact answers.\n' +
      '3. **Cite Sources**: Always include the specific documentation files you used in your final report.\n' +
      '4. **Non-Interactive**: You operate in a loop and cannot ask the user for more info. If the question is ambiguous, answer as best as you can with the information available.\n\n' +
      'You MUST call `complete_task` with a JSON report containing your `answer` and the `sources` you used.',
  },
});
