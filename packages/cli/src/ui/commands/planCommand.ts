/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand, CommandContext } from './types.js';
import { CommandKind } from './types.js';

/**
 * /plan command - Activates plan mode where the agent creates a detailed plan
 * that must be approved before execution
 */
export const planCommand: SlashCommand = {
  name: 'plan',
  altNames: [],
  description:
    'Create an execution plan for the given task (requires approval before execution)',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext, args: string) => {
    const promptText = args.trim();

    if (!promptText) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Please provide a task description after /plan',
      };
    }

    // Create a special prompt that instructs the agent to create a plan first
    const planPrompt = `**PLAN MODE ACTIVATED**

You are in PLAN MODE. For the following task, you MUST:

1. **Analyze the task** thoroughly
2. **Break it down** into discrete, numbered subtasks
3. **Present the plan** to the user in a clear, structured format
4. **STOP and WAIT** for user approval before proceeding

Do NOT execute any subtasks until the user explicitly approves the plan.

**Task:** ${promptText}

Please provide a detailed execution plan now.`;

    return {
      type: 'submit_prompt',
      content: [{ text: planPrompt }],
    };
  },
};
