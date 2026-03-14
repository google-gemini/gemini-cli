/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolDefinition } from './types.js';

export const VISUALIZE_TOOL_NAME = 'visualize';
export const VISUALIZE_DISPLAY_NAME = 'Visualize';

export const VISUALIZE_DEFINITION: ToolDefinition = {
  base: {
    name: VISUALIZE_TOOL_NAME,
    description:
      'Generates and renders visual diagrams and previews directly in the terminal. ' +
      'Supports Mermaid diagrams (flowcharts, sequence diagrams, class diagrams, ER diagrams), ' +
      'dependency graph visualization from package.json/requirements.txt, ' +
      'git history visualization, and HTML/CSS component previews opened in the browser. ' +
      'Use this tool when the user asks to explain architecture, visualize dependencies, ' +
      'see data flows, or preview generated UI components.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        type: {
          description:
            'The type of visualization. "mermaid": render a Mermaid diagram (pass mermaid code in content). ' +
            '"dependency_graph": visualize dependencies from a manifest file (pass file_path). ' +
            '"git_history": visualize git commit/branch history. ' +
            '"html_preview": open HTML content in browser (pass html).',
          type: 'string',
          enum: ['mermaid', 'dependency_graph', 'git_history', 'html_preview'],
        },
        content: {
          description: 'Mermaid diagram code. Required when type is "mermaid".',
          type: 'string',
        },
        file_path: {
          description:
            'Path to dependency manifest file (package.json, requirements.txt, go.mod). Required when type is "dependency_graph".',
          type: 'string',
        },
        html: {
          description:
            'HTML content to preview in browser. Required when type is "html_preview".',
          type: 'string',
        },
        title: {
          description: 'Optional title displayed above the diagram.',
          type: 'string',
        },
      },
      required: ['type'],
    },
  },
};
