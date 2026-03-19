/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { InstancesClient } from '@google-cloud/compute';
import { WorkspaceService } from './workspaceService.js';

export interface ProvisionOptions {
  instanceName: string;
  machineType: string;
  imageTag: string;
  zone: string;
  workspaceId: string;
}

export class ComputeService {
  private client: InstancesClient;
  private projectId: string;
  private workspaceService = new WorkspaceService();

  constructor() {
    this.client = new InstancesClient();
    // In a real GCP environment, this is usually available via metadata server or env
    this.projectId = process.env['GOOGLE_CLOUD_PROJECT'] || 'dev-project';
  }

  getProjectId(): string {
    return this.projectId;
  }

  /**
   * Provision a new GCE VM with the Workspace Container
   */
  async createWorkspaceInstance(options: ProvisionOptions): Promise<void> {
    const { instanceName, machineType, imageTag, zone, workspaceId } = options;
    
    // Logic to call GCP Compute API to create VM
    // ... insert instance call ...

    // eslint-disable-next-line no-console
    console.log(`[ComputeService] Provisioning ${instanceName} in ${zone} (Image: ${imageTag})...`);
    
    // Simulating async provisioning success for this prototype
    // In a real implementation, we would wait for the long-running operation or poll
    this.waitForInstanceAndMarkReady(workspaceId, instanceName, zone).catch(err => {
        // eslint-disable-next-line no-console
        console.error(`[ComputeService] Failed to track provisioning for ${workspaceId}:`, err);
    });
  }

  private async waitForInstanceAndMarkReady(workspaceId: string, instanceName: string, zone: string) {
    // Poll for status or wait for operation
    let attempts = 0;
    while (attempts < 10) {
        // eslint-disable-next-line no-console
        console.log(`[ComputeService] Waiting for ${instanceName} to be READY... (${attempts+1}/10)`);
        
        // In real GCP, we'd check this.client.get({ project, zone, instance })
        // For prototype, we'll just wait a few seconds and mark it as READY
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
        
        if (attempts >= 3) {
            await this.workspaceService.updateWorkspace(workspaceId, { status: 'READY' });
            // eslint-disable-next-line no-console
            console.log(`[ComputeService] Workspace ${workspaceId} is now READY.`);
            return;
        }
    }
  }

  /**
   * Delete a GCE VM
   */
  async deleteWorkspaceInstance(instanceName: string, zone: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[ComputeService] Deleting instance ${instanceName} in ${zone}...`);
    // Logic to call GCP Compute API to delete VM
    // ... delete instance call ...
  }
}
