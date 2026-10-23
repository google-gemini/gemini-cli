/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentDefinition } from './types.js';
import { GEMINI_MODEL_ALIAS_FLASH } from '../config/models.js';
import { z } from 'zod';
import { GetInternalDocsTool } from '../tools/get-internal-docs.js';
import { GetCliReferenceTool } from '../tools/get-cli-reference.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';

const CliHelpReportSchema = z.object({
  answer: z
    .string()
    .describe('The detailed answer to the user question about Gemini CLI.'),
  sources: z
    .array(z.string())
    .describe('The documentation files or reference categories used to answer the question.'),
});

/**
 * An agent specialized in answering questions about Gemini CLI itself,
 * using its own documentation, runtime state, and authoritative reference data.
 */
export const CliHelpAgent = (
  context: AgentLoopContext,
): AgentDefinition<typeof CliHelpReportSchema> => ({
  name: 'cli_help',
  kind: 'local',
  displayName: 'CLI Help Agent',
  description:
    'Specialized agent for answering questions about the Gemini CLI application. Invoke this agent for questions regarding CLI flags, keyboard shortcuts, slash commands, configuration schemas (e.g., policies), approval modes, self-execution patterns, or instructions on how to create custom subagents. It queries internal documentation and a structured reference tool to provide accurate, grounded usage guidance.',
  inputConfig: {
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The specific question about Gemini CLI.',
        },
      },
      required: ['question'],
    },
  },
  outputConfig: {
    outputName: 'report',
    description: 'The final answer and sources as a JSON object.',
    schema: CliHelpReportSchema,
  },

  processOutput: (output) => {
    if (!output) {
      return '';
    }
    const answer = output.answer?.trim() ?? '';
    const uniqueSources = Array.from(
      new Set(
        (output.sources ?? [])
          .map((s) => s?.trim())
          .filter((s) => s && s.length > 0),
      ),
    );

    if (uniqueSources.length > 0) {
      return `${answer}\n\n**Sources:**\n${uniqueSources.map((s) => `- ${s}`).join('\n')}`;
    }
    return answer;
  },

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
    tools: [
      new GetCliReferenceTool(context.messageBus),
      new GetInternalDocsTool(context.messageBus),
    ],
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
      '### Instructions\n' +
      '1. **Ground Your Answers in Reference Data**: For questions about CLI flags, keyboard shortcuts, slash commands, or how to invoke Gemini from the terminal, **always** call `get_cli_reference` first. This tool returns authoritative data derived from the runtime source of truth. Do not guess or recall flags from memory, the reference is definitive.\n' +
      '   - Use `category: "flags"` for CLI flag and invocation questions.\n' +
      '   - Use `category: "hotkeys"` for keyboard shortcut questions.\n' +
      '   - Use `category: "commands"` for slash command questions.\n' +
      '   - Use `category: "all"` when the question spans multiple categories.\n' +
      '2. **Explore Documentation for Deeper Topics**: For questions about configuration schemas, policies, GEMINI.md, subagent creation, extensions, hooks, or advanced topics not covered by the reference tool, use `get_internal_docs` to find the relevant documentation file. If unsure where to start, call `get_internal_docs()` without arguments to see available files.\n' +
      '3. **Deprecation Awareness**: The `--yolo` flag is deprecated. The correct flag is `--approval-mode=yolo`. Always recommend the current form.\n' +
      '4. **Be Precise About Self-Execution**: When a user asks how to run Gemini for specific workflows, construct the exact command using only flags confirmed by the reference tool. Example: `gemini -p "Fix the bug in auth.ts" --sandbox --approval-mode=auto_edit --output-format json`.\n' +
      '5. **Cite Sources**: Always include the specific reference categories or documentation files you used in your final report.\n' +
      '6. **Non-Interactive**: You operate in a loop and cannot ask the user for more info. If the question is ambiguous, answer as best as you can with the information available.\n\n' +
      'You MUST call `complete_task` with a JSON report containing your `answer` and the `sources` you used.',
  },
});
