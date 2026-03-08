/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';

export const explainCommand: SlashCommand = {
    name: 'explain',
    description: 'Explain code or concepts, optionally with a visual diagram',
    kind: CommandKind.BUILT_IN,
    autoExecute: true,
    action: async (context, args) => {
        const rawInputArg = args.trim();
        if (!rawInputArg) {
            context.ui.addItem({
                type: MessageType.ERROR,
                text: 'Usage: /explain <query> or /explain @file',
            });
            return;
        }

        const visualizeRequested =
            /(?:^|\s)(?:--visualize|-v)(?=\s|$)/i.test(rawInputArg);
        const inputArg = rawInputArg
            .replace(/(?:^|\s)(?:--visualize|-v)(?=\s|$)/gi, ' ')
            .trim();

        if (!inputArg) {
            context.ui.addItem({
                type: MessageType.ERROR,
                text: 'Usage: /explain <query> or /explain @file',
            });
            return;
        }

        const isVisualizeEnabled =
            visualizeRequested ||
            (context.services.config?.getVisualize() ?? false);

        // Specialized prompt to encourage visualization
        const enhancedPrompt = `
Explain the following code or concept in detail. 
${isVisualizeEnabled
                ? "You MUST provide a visual representation using Mermaid syntax in a ```mermaid``` block. Prefer a simple top-down flowchart when possible, keep labels short, and avoid Mermaid style directives or unnecessary HTML entities."
                : "If a visual representation would help, provide one using Mermaid syntax in a ```mermaid``` block. Prefer a simple top-down flowchart with short labels."
            }

Query: ${inputArg}
`.trim();

        return {
            type: 'submit_prompt',
            content: [{ text: enhancedPrompt }],
        };
    },
};
