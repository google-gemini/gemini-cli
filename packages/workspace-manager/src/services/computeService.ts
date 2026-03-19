/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { InstancesClient } from '@google-cloud/compute';

export interface ProvisionOptions {
  instanceName: string;
  machineType: string;
  imageTag: string;
  zone: string;
}

export class ComputeService {
  private client: InstancesClient;

  constructor() {
    this.client = new InstancesClient();
  }

  /**
   * Provision a new GCE VM with the Workspace Container
   */
  async createWorkspaceInstance(options: ProvisionOptions): Promise<void> {
    // TODO: Implement actual instancesClient.insert call
    // For now, we just log and return
    // eslint-disable-next-line no-console
    console.log(
      `[ComputeService] Mocking creation of ${options.instanceName} in ${options.zone}`,
    );
  }

  /**
   * Terminate a GCE VM
   */
  async deleteWorkspaceInstance(
    instanceName: string,
    zone: string,
  ): Promise<void> {
    // TODO: Implement actual instancesClient.delete call
    // eslint-disable-next-line no-console
    console.log(
      `[ComputeService] Mocking deletion of ${instanceName} in ${zone}`,
    );
  }
}
