/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  type SlashCommand,
  type CommandContext,
  type SlashCommandActionReturn,
} from './types.js';

export const mapCommand: SlashCommand = {
  name: 'map',
  description: 'Generate a structural map of the project architecture',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (
    _context: CommandContext,
    _args: string,
  ): Promise<SlashCommandActionReturn> => ({
    type: 'submit_prompt',
    content: [
      {
        text: 'Please analyze the project structure. First collect all entry points constraints, components and data flows by making detailed queries using the `map_project_structure` tool, going directory by directory if needed. Understand how these connect to each other. Once you have a deep holistic understanding of the codebase and have stopped discovering new key files, summarize this into a comprehensive Mermaid.js classDiagram or flowchart. Wrap your result in ```mermaid format. Group components by directory.',
      },
    ],
    systemPromptExtension:
      'You are an Architecture Cartographer. Your role is to explore the codebase using the tools available, trace the imports precisely, and create an accurate dependency flowchart. Only declare finished once you map out a comprehensive overview.',
    tools: ['map_project_structure'],
  }),
};
