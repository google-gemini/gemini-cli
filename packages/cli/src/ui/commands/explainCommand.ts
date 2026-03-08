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
        const inputArg = args.trim();
        if (!inputArg) {
            context.ui.addItem({
                type: MessageType.ERROR,
                text: 'Usage: /explain <query> or /explain @file',
            });
            return;
        }

        const isVisualizeEnabled = context.services.config?.getVisualize() ?? false;

        // Specialized prompt to encourage visualization
        const enhancedPrompt = `
Explain the following code or concept in detail. 
${isVisualizeEnabled
                ? "You MUST provide a visual representation (like a sequence diagram, flowchart, or class diagram) using Mermaid syntax in a ```mermaid``` block to illustrate your explanation."
                : "If a visual representation (like a sequence diagram, flowchart, or class diagram) would help clarify the explanation, please provide one using Mermaid syntax in a ```mermaid``` block."
            }

Query: ${inputArg}
`.trim();

        return {
            type: 'submit_prompt',
            content: [{ text: enhancedPrompt }],
        };
    },
};
