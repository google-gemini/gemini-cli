/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SlashCommand,
  SlashCommandActionReturn,
  CommandContext,
} from './types.js';
import { CommandKind } from './types.js';

const VISUALIZE_PROMPT = `You are a visualization assistant. The user wants you to analyze the current codebase or context and create a visual diagram.

Your task:
1. Analyze the codebase/context relevant to the user's request.
2. Generate a Mermaid diagram syntax that accurately represents what the user asked to visualize.
3. Present the Mermaid syntax in a fenced code block with the \`mermaid\` language tag.
4. Then, render an ASCII text art version of the same diagram directly in your response so it displays in the terminal.

ASCII diagram rules:
- Use box-drawing characters for boxes: ─ │ ┌ ┐ └ ┘
- Use ┬ on the bottom border of a parent box where the line exits downward.
- Use │ for vertical lines between boxes, with a ▼ arrow at the end just before the child box.
- Lines MUST connect directly to box borders — no floating gaps.
- Example of a single parent-child connection:
  ┌──────────┐
  │  Parent   │
  └────┬──────┘
       │
       ▼
  ┌──────────┐
  │  Child    │
  └──────────┘
- Example of a parent with multiple children:
  ┌──────────────┐
  │    Parent     │
  └──┬─────┬────┬┘
     │     │    │
     ▼     ▼    ▼
  ┌────┐┌────┐┌────┐
  │ A  ││ B  ││ C  │
  └────┘└────┘└────┘
- Always include ▼ arrows to show direction of flow.
- Keep boxes aligned and use consistent spacing.

Always provide BOTH the Mermaid syntax (for future use) and the ASCII rendering (for immediate terminal display).`;

export const visualizeCommand: SlashCommand = {
  name: 'visualize',
  description:
    'Analyze the codebase and generate a Mermaid diagram rendered as ASCII art',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<SlashCommandActionReturn> => {
    const userRequest = args?.trim() || context.invocation?.args?.trim() || '';

    if (!userRequest) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Please specify what to visualize. Usage: /visualize <description>\nExample: /visualize architecture of this project',
      };
    }

    return {
      type: 'submit_prompt',
      content: [
        { text: VISUALIZE_PROMPT },
        { text: `User request: ${userRequest}` },
      ],
    };
  },
};
