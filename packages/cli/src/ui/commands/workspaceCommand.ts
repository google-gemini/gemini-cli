/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand, CommandContext } from './types.js';
import { CommandKind } from './types.js';
import type { MessageActionReturn } from '@google/gemini-cli-core';
import { WorkspaceHubClient } from '@google/gemini-cli-core';

const listAction = async (
  _context: CommandContext,
): Promise<void | MessageActionReturn> => {
  const hubUrl =
    process.env['GEMINI_WORKSPACE_HUB_URL'] || 'http://localhost:8080';
  const client = new WorkspaceHubClient(hubUrl);

  try {
    const workspaces = await client.listWorkspaces();

    if (workspaces.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No active workspaces found.',
      };
    }

    let content = 'Active Workspaces:\n';
    content += '------------------------------------------------------------\n';
    for (const ws of workspaces) {
      content += `${ws.name.padEnd(20)} | ${ws.status.padEnd(12)} | ${ws.id}\n`;
    }
    content += '------------------------------------------------------------';

    return {
      type: 'message',
      messageType: 'info',
      content,
    };
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const message = (error as Error).message;
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to list workspaces: ${message}`,
    };
  }
};

const listCommand: SlashCommand = {
  name: 'list',
  altNames: ['ls'],
  description: 'List remote workspaces',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context) => listAction(context),
};

const createCommand: SlashCommand = {
  name: 'create',
  description: 'Create a new remote workspace',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<MessageActionReturn> => {
    const name = args.trim();
    if (!name) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Workspace name is required. Usage: /workspace create <name>',
      };
    }

    const hubUrl =
      process.env['GEMINI_WORKSPACE_HUB_URL'] || 'http://localhost:8080';
    const client = new WorkspaceHubClient(hubUrl);

    try {
      context.ui.addItem({
        type: 'info',
        text: `Requesting creation of workspace "${name}"...`,
      });
      const ws = await client.createWorkspace(name);
      return {
        type: 'message',
        messageType: 'info',
        content: `✅ Workspace created successfully!\nID:   ${ws.id}\nName: ${ws.name}\nGCE:  ${ws.instance_name}`,
      };
    } catch (error: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const message = (error as Error).message;
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to create workspace: ${message}`,
      };
    }
  },
};

const deleteCommand: SlashCommand = {
  name: 'delete',
  altNames: ['rm'],
  description: 'Delete a remote workspace',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<MessageActionReturn> => {
    const id = args.trim();
    if (!id) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Workspace ID is required. Usage: /workspace delete <id>',
      };
    }

    const hubUrl =
      process.env['GEMINI_WORKSPACE_HUB_URL'] || 'http://localhost:8080';
    const client = new WorkspaceHubClient(hubUrl);

    try {
      context.ui.addItem({
        type: 'info',
        text: `Deleting workspace "${id}"...`,
      });
      await client.deleteWorkspace(id);
      return {
        type: 'message',
        messageType: 'info',
        content: `✅ Workspace ${id} deleted successfully.`,
      };
    } catch (error: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const message = (error as Error).message;
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to delete workspace: ${message}`,
      };
    }
  },
};

const connectCommand: SlashCommand = {
  name: 'connect',
  description: 'Connect to a remote workspace',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<MessageActionReturn> => {
    const id = args.trim();
    if (!id) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Workspace ID is required. Usage: /workspace connect <id>',
      };
    }
    return {
      type: 'submit_prompt',
      content: `I want to connect to remote workspace "${id}". Please run the connect command.`,
    };
  },
};

export const workspaceSlashCommand: SlashCommand = {
  name: 'workspace',
  altNames: ['wsr'],
  description: 'Manage remote workspaces',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [listCommand, createCommand, deleteCommand, connectCommand],
  action: async (context: CommandContext) => listAction(context),
};
