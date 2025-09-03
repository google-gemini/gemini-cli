/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'prompt-server',
  version: '1.0.0',
});

server.registerTool(
  'fetch_posts',
  {
    description: 'Fetches a list of posts from a public API.',
    inputSchema: z.object({}).shape,
  },
  async () => {
    const apiResponse = await fetch(
      'https://jsonplaceholder.typicode.com/posts',
    );
    const posts = await apiResponse.json();
    const response = { posts: posts.slice(0, 5) };
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response),
        },
      ],
    };
  },
);

server.registerPrompt(
  'poem-writer',
  {
    title: 'Poem Writer',
    description: 'Write a nice haiku',
    argsSchema: { title: z.string(), mood: z.string().optional() },
  },
  ({ title, mood }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Write a haiku${mood ? ` with the mood ${mood}` : ''} called ${title}. Note that a haiku is 5 syllables followed by 7 syllables followed by 5 syllables `,
        },
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
