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
      'Supports Mermaid diagrams (flowcharts, sequence diagrams) ' +
      'and HTML/CSS component previews opened in the browser. ' +
      'Use this tool when the user asks to explain architecture, ' +
      'see data flows, or preview generated UI components.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        type: {
          description:
            'The type of visualization. "mermaid": render a Mermaid diagram (pass mermaid code in content). ' +
            '"html_preview": open HTML content in browser (pass html).',
          type: 'string',
          enum: ['mermaid', 'html_preview'],
        },
        content: {
          description:
            'Mermaid diagram code (flowchart syntax). Required when type is "mermaid". ' +
            'IMPORTANT: Use only simple flowchart syntax. Start with "graph TD" (top-down) or "graph LR" (left-right). ' +
            'Each edge must be on its own line. Use --> for arrows, --- for links. ' +
            'Node syntax: A[label] for rectangles, A{label} for diamonds, A(label) for rounded. ' +
            'Example BST:\ngraph TD\n  A[15] --> B[10]\n  A --> C[20]\n  B --> D[5]\n  B --> E[12]\n' +
            'Example pipeline:\ngraph LR\n  A[Build] --> B[Test]\n  B --> C[Deploy]\n' +
            'Example linked list:\ngraph LR\n  A[10 | ptr] --> B[20 | ptr] --> C[30 | null]\n' +
            'DO NOT use subgraph, gitGraph, classDiagram, or other advanced syntax. Only flowchart/graph.',
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
        structure: {
          description:
            'Rendering hint for data structure visualizations. When set, uses a dedicated ' +
            'renderer optimized for that structure instead of the generic flowchart layout. ' +
            'Use "linked-list" for singly linked lists, "doubly-linked-list" for doubly linked lists, ' +
            '"binary-tree" for BST/AVL/heap trees, "stack" for LIFO stacks, "queue" for FIFO queues, ' +
            '"graph" for generic graphs, "flowchart" for pipelines/state machines.',
          type: 'string',
          enum: [
            'linked-list',
            'doubly-linked-list',
            'binary-tree',
            'stack',
            'queue',
            'graph',
            'flowchart',
          ],
        },
      },
      required: ['type'],
    },
  },
};
