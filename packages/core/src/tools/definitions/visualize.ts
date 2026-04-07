/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolDefinition } from './types.js';
import { VISUALIZE_TOOL_NAME } from '../tool-names.js';

export const VISUALIZE_DEFINITION: ToolDefinition = {
  base: {
    name: VISUALIZE_TOOL_NAME,
    description:
      'Render Mermaid diagrams (flowchart, sequence, class, erd) as terminal-friendly ASCII text.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        mermaid: {
          type: 'string',
          description: 'The Mermaid diagram source text.',
        },
        diagramType: {
          type: 'string',
          enum: ['flowchart', 'sequence', 'class', 'erd'],
          description:
            'Optional diagram type override. When omitted, type is detected from the Mermaid header.',
        },
        title: {
          type: 'string',
          description: 'Optional title included above rendered output.',
        },
      },
      required: ['mermaid'],
    },
  },
};
