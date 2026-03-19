/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { WorkspaceHubClient } from '../services/workspaceHubClient.js';
import type { CommandActionReturn } from './types.js';

function getHubUrl(config: Config): string {
  if (process.env['GEMINI_WORKSPACE_HUB_URL']) {
    return process.env['GEMINI_WORKSPACE_HUB_URL'];
  }

  const workspaces = config.getWorkspaces();
  if (workspaces) {
    const hubName = workspaces.defaultHub;
    if (hubName && workspaces.hubs[hubName]) {
      return workspaces.hubs[hubName].url;
    }
  }

  return 'http://localhost:8080';
}

export async function listWorkspaces(
  config: Config,
): Promise<CommandActionReturn> {
  const hubUrl = getHubUrl(config);
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

    return {
      type: 'workspaces_list',
      workspaces,
    };
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const message = (error as Error).message || String(error);
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to list workspaces: ${message}`,
    };
  }
}

export async function createWorkspace(
  config: Config,
  name: string,
  machineType?: string,
): Promise<CommandActionReturn> {
  const hubUrl = getHubUrl(config);
  const client = new WorkspaceHubClient(hubUrl);

  try {
    const ws = await client.createWorkspace(name, machineType);
    return {
      type: 'message',
      messageType: 'info',
      content: `✓ Workspace created successfully!\nID:   ${ws.id}\nName: ${ws.name}\nGCE:  ${ws.instance_name}`,
    };
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const message = (error as Error).message || String(error);
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to create workspace: ${message}`,
    };
  }
}

export async function deleteWorkspace(
  config: Config,
  id: string,
): Promise<CommandActionReturn> {
  const hubUrl = getHubUrl(config);
  const client = new WorkspaceHubClient(hubUrl);

  try {
    await client.deleteWorkspace(id);
    return {
      type: 'message',
      messageType: 'info',
      content: `✓ Workspace ${id} deleted successfully.`,
    };
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const message = (error as Error).message || String(error);
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to delete workspace: ${message}`,
    };
  }
}
