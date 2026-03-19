/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { fetchWithTimeout } from '../utils/fetch.js';
import { debugLogger } from '../utils/debugLogger.js';

export interface WorkspaceHubInfo {
  id: string;
  name: string;
  instance_name: string;
  status: string;
  machine_type: string;
  zone: string;
  project_id: string;
  created_at: string;
  owner_id: string;
}

export class WorkspaceHubClient {
  constructor(private readonly hubUrl: string) {}

  /**
   * List all workspaces for the authenticated user
   */
  async listWorkspaces(): Promise<WorkspaceHubInfo[]> {
    const url = new URL('/workspaces', this.hubUrl).toString();
    debugLogger.log(`[WorkspaceHubClient] Fetching workspaces from ${url}`);

    try {
      const response = await fetchWithTimeout(url, 10000, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // TODO: Add Authorization header (OAuth/IAP)
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Hub API error (${response.status}): ${errorText}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return (await response.json()) as WorkspaceHubInfo[];
    } catch (error) {
      debugLogger.error(
        `[WorkspaceHubClient] Failed to list workspaces:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Fetch a specific workspace by ID or name
   */
  async getWorkspace(idOrName: string): Promise<WorkspaceHubInfo | null> {
    const workspaces = await this.listWorkspaces();
    return (
      workspaces.find((w) => w.id === idOrName || w.name === idOrName) || null
    );
  }

  /**
   * Create a new workspace
   */
  async createWorkspace(
    name: string,
    machineType?: string,
  ): Promise<WorkspaceHubInfo> {
    const url = new URL('/workspaces', this.hubUrl).toString();
    debugLogger.log(
      `[WorkspaceHubClient] Creating workspace ${name} at ${url}`,
    );

    const response = await fetchWithTimeout(url, 15000, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, machineType }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Hub API error (${response.status}): ${errorText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return (await response.json()) as WorkspaceHubInfo;
  }

  /**
   * Notify the hub that a user is connecting to a workspace
   */
  async notifyConnect(id: string): Promise<void> {
    const url = new URL(`/workspaces/${id}/connect`, this.hubUrl).toString();
    const response = await fetchWithTimeout(url, 5000, {
      method: 'POST',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Hub API error (${response.status}): ${errorText}`);
    }
  }

  /**
   * Delete a workspace
   */
  async deleteWorkspace(id: string): Promise<void> {
    const url = new URL(`/workspaces/${id}`, this.hubUrl).toString();
    debugLogger.log(`[WorkspaceHubClient] Deleting workspace ${id} at ${url}`);

    const response = await fetchWithTimeout(url, 10000, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Hub API error (${response.status}): ${errorText}`);
    }
  }
}
