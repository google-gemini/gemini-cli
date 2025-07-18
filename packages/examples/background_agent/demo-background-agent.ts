/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BackgroundAgentMessageSchema = z.object({
  role: z.enum(['user', 'agent']),
  parts: z.array(z.any()),
});

const BackgroundAgentTaskStatusSchema = z.object({
  state: z.enum([
    'submitted',
    'working',
    'input-required',
    'completed',
    'canceled',
    'failed',
  ]),
  message: BackgroundAgentMessageSchema.optional(),
});

const BackgroundAgentTaskSchema = z.object({
  id: z.string(),
  status: BackgroundAgentTaskStatusSchema,
  history: z.array(BackgroundAgentMessageSchema).optional(),
});
type BackgroundAgentTask = z.infer<typeof BackgroundAgentTaskSchema>;

const server = new McpServer({
  name: 'demo-background-agent',
  version: '1.0.0',
});

const idToTask = new Map<string, BackgroundAgentTask>();

server.registerTool(
  'startTask',
  {
    title: 'Start a new task',
    description: 'Launches a new task asynchronously.',
    inputSchema: { prompt: BackgroundAgentMessageSchema },
    outputSchema: BackgroundAgentTaskSchema.shape,
  },
  ({ prompt }) => {
    const task: BackgroundAgentTask = {
      id: crypto.randomUUID(),
      status: {
        state: 'submitted',
        message: prompt,
      },
      history: [],
    };

    idToTask.set(task.id, task);

    return {
      content: [],
      structuredContent: task,
    };
  },
);

server.registerTool(
  'getTask',
  {
    title: 'Get a task',
    inputSchema: { id: z.string() },
    outputSchema: BackgroundAgentTaskSchema.shape,
  },
  ({ id }) => {
    const task = idToTask.get(id);
    if (!task) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'No such task',
          },
        ],
      };
    }

    return {
      content: [],
      structuredContent: task,
    };
  },
);

server.registerTool(
  'listTasks',
  {
    title: 'Lists tasks',
    outputSchema: {
      tasks: z.array(BackgroundAgentTaskSchema),
    },
  },
  () => {
    const out = {
      tasks: Array.from(idToTask.values()),
    };
    return {
      content: [],
      structuredContent: out,
    };
  },
);

server.registerTool(
  'messageTask',
  {
    title: 'Send a message to a task',
    inputSchema: {
      id: z.string(),
      message: BackgroundAgentMessageSchema,
    },
  },
  ({ id, message }) => {
    const task = idToTask.get(id);
    if (!task) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'No such task',
          },
        ],
      };
    }

    task.history?.push(message);
    task.status.message = message;

    const statuses = BackgroundAgentTaskStatusSchema.shape.state.options;
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    task.status.state = randomStatus;

    return {
      content: [],
    };
  },
);

server.registerTool(
  'deleteTask',
  {
    title: 'Delete a task',
    inputSchema: { id: z.string() },
  },
  ({ id }) => {
    const task = idToTask.get(id);
    if (!task) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'No such task',
          },
        ],
      };
    }
    idToTask.delete(id);

    return {
      content: [
        {
          type: 'text',
          text: 'Task deleted',
        },
      ],
    };
  },
);

server.registerTool(
  'cancelTask',
  {
    title: 'Cancels a task',
    inputSchema: { id: z.string() },
  },
  ({ id }) => {
    const task = idToTask.get(id);
    if (!task) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'No such task',
          },
        ],
      };
    }
    task.status.state = 'canceled';

    return {
      content: [
        {
          type: 'text',
          text: 'Task cancelled',
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
