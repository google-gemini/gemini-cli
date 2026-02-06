/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'mock-dedup-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'duplicates',
      description: 'Find duplicate issues',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          issue_number: { type: 'number' },
        },
        required: ['repo', 'issue_number'],
      },
    },
    {
      name: 'refresh',
      description: 'Refresh embeddings for all issues in a repository',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          force: { type: 'boolean' },
        },
        required: ['repo'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case 'duplicates': {
      const issueNumber = request.params.arguments?.issue_number;

      // Logic to return different results based on issue number
      switch (issueNumber) {
        case 101:
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify([
                  { number: 201, similarity: 0.95 },
                  { number: 202, similarity: 0.85 },
                ]),
              },
            ],
          };

        // Edge Case: False Positive / Ambiguous
        case 301:
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify([
                  { number: 302, similarity: 0.88 }, // High similarity but different root cause
                ]),
              },
            ],
          };

        // Edge Case: Low similarity (should reject)
        case 401:
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify([{ number: 402, similarity: 0.75 }]),
              },
            ],
          };

        // Edge Case: Multiple duplicates
        case 501:
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify([
                  { number: 502, similarity: 0.92 },
                  { number: 503, similarity: 0.91 },
                ]),
              },
            ],
          };

        default:
          return {
            content: [{ type: 'text', text: '[]' }],
          };
      }
    }

    case 'refresh':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ status: 'success', refreshed_count: 10 }),
          },
        ],
      };

    default:
      throw new Error('Tool not found');
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Mock Dedup MCP server running');
