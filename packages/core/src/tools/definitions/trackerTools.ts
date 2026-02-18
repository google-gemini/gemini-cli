/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolDefinition } from './types.js';
import {
  TRACKER_INIT_TOOL_NAME,
  TRACKER_CREATE_TASK_TOOL_NAME,
  TRACKER_UPDATE_TASK_TOOL_NAME,
  TRACKER_GET_TASK_TOOL_NAME,
  TRACKER_LIST_TASKS_TOOL_NAME,
  TRACKER_ADD_DEPENDENCY_TOOL_NAME,
  TRACKER_VISUALIZE_TOOL_NAME,
} from '../tool-names.js';

export const TRACKER_INIT_DEFINITION: ToolDefinition = {
  base: {
    name: TRACKER_INIT_TOOL_NAME,
    description:
      'Initializes the task tracker in the current workspace by creating the .tracker directory.',
    parametersJsonSchema: {
      type: 'object',
      properties: {},
    },
  },
};

export const TRACKER_CREATE_TASK_DEFINITION: ToolDefinition = {
  base: {
    name: TRACKER_CREATE_TASK_TOOL_NAME,
    description: 'Creates a new task in the tracker.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short title of the task.',
        },
        description: {
          type: 'string',
          description: 'Detailed description of the task.',
        },
        type: {
          type: 'string',
          enum: ['epic', 'task', 'bug'],
          description: 'Type of the task.',
        },
        parentId: {
          type: 'string',
          description: 'Optional ID of the parent task.',
        },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of task IDs that this task depends on.',
        },
      },
      required: ['title', 'description', 'type'],
    },
  },
};

export const TRACKER_UPDATE_TASK_DEFINITION: ToolDefinition = {
  base: {
    name: TRACKER_UPDATE_TASK_TOOL_NAME,
    description: 'Updates an existing task in the tracker.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The 6-character hex ID of the task to update.',
        },
        title: {
          type: 'string',
          description: 'New title for the task.',
        },
        description: {
          type: 'string',
          description: 'New description for the task.',
        },
        status: {
          type: 'string',
          enum: ['open', 'in_progress', 'blocked', 'closed'],
          description: 'New status for the task.',
        },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'New list of dependency IDs.',
        },
      },
      required: ['id'],
    },
  },
};

export const TRACKER_GET_TASK_DEFINITION: ToolDefinition = {
  base: {
    name: TRACKER_GET_TASK_TOOL_NAME,
    description: 'Retrieves details for a specific task.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The 6-character hex ID of the task.',
        },
      },
      required: ['id'],
    },
  },
};

export const TRACKER_LIST_TASKS_DEFINITION: ToolDefinition = {
  base: {
    name: TRACKER_LIST_TASKS_TOOL_NAME,
    description:
      'Lists tasks in the tracker, optionally filtered by status, type, or parent.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'in_progress', 'blocked', 'closed'],
          description: 'Filter by status.',
        },
        type: {
          type: 'string',
          enum: ['epic', 'task', 'bug'],
          description: 'Filter by type.',
        },
        parentId: {
          type: 'string',
          description: 'Filter by parent task ID.',
        },
      },
    },
  },
};

export const TRACKER_ADD_DEPENDENCY_DEFINITION: ToolDefinition = {
  base: {
    name: TRACKER_ADD_DEPENDENCY_TOOL_NAME,
    description: 'Adds a dependency between two tasks.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The ID of the task that has a dependency.',
        },
        dependencyId: {
          type: 'string',
          description: 'The ID of the task that is being depended upon.',
        },
      },
      required: ['taskId', 'dependencyId'],
    },
  },
};

export const TRACKER_VISUALIZE_DEFINITION: ToolDefinition = {
  base: {
    name: TRACKER_VISUALIZE_TOOL_NAME,
    description: 'Renders an ASCII tree visualization of the task graph.',
    parametersJsonSchema: {
      type: 'object',
      properties: {},
    },
  },
};
