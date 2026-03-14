/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolDefinition } from './types.js';
import {
  VISUALIZE_TOOL_NAME,
  VISUALIZE_PARAM_DIAGRAM_TYPE,
  VISUALIZE_PARAM_CONTENT,
  VISUALIZE_PARAM_TITLE,
} from './base-declarations.js';

export const VISUALIZE_DEFINITION: ToolDefinition = {
  base: {
    name: VISUALIZE_TOOL_NAME,
    description:
      'Generate and render architecture diagrams, flowcharts, sequence diagrams, class diagrams, and ERDs as ASCII art directly in the terminal. ' +
      'Accepts Mermaid diagram syntax and renders it inline. ' +
      'Use this tool whenever the user asks to visualize, diagram, or draw any system, flow, architecture, or relationship. ' +
      'Supported diagram types: flowchart, sequence, class, erd.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [VISUALIZE_PARAM_DIAGRAM_TYPE]: {
          type: 'string',
          enum: ['flowchart', 'sequence', 'class', 'erd'],
          description:
            'The type of diagram to render. Use "flowchart" for process flows and dependency graphs, "sequence" for interaction timelines, "class" for OOP class hierarchies, "erd" for database entity-relationship diagrams.',
        },
        [VISUALIZE_PARAM_CONTENT]: {
          type: 'string',
          description:
            'The Mermaid diagram definition string. For flowchart: use "graph TD" or "graph LR" syntax. For sequence: use "sequenceDiagram" syntax. For class: use "classDiagram" syntax. For erd: use "erDiagram" syntax.',
        },
        [VISUALIZE_PARAM_TITLE]: {
          type: 'string',
          description: 'Optional human-readable title for the diagram.',
        },
      },
      required: [VISUALIZE_PARAM_DIAGRAM_TYPE, VISUALIZE_PARAM_CONTENT],
    },
  },
};
