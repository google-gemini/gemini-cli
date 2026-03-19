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
  private projectId: string;

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
    const { instanceName, machineType, imageTag, zone } = options;

    // TODO: Get the actual base image URL from config
    const containerImage = `us-west1-docker.pkg.dev/${this.projectId}/workspaces/gemini-workspace:${imageTag}`;

    // The container declaration for Container-Optimized OS
    const containerDeclaration = `
spec:
  containers:
    - name: workspace
      image: ${containerImage}
      securityContext:
        privileged: false
      stdin: true
      tty: true
  restartPolicy: Always
`;

    const [operation] = await this.client.insert({
      project: this.projectId,
      zone,
      instanceResource: {
        name: instanceName,
        machineType: `zones/${zone}/machineTypes/${machineType}`,
        disks: [
          {
            boot: true,
            autoDelete: true,
            initializeParams: {
              sourceImage: 'projects/cos-cloud/global/images/family/cos-stable',
            },
          },
        ],
        networkInterfaces: [
          {
            network: 'global/networks/default',
            // We use IAP for access, but a NAT might be needed for outbound internet
            accessConfigs: [{ name: 'External NAT', type: 'ONE_TO_ONE_NAT' }],
          },
        ],
        metadata: {
          items: [
            {
              key: 'gce-container-declaration',
              value: containerDeclaration,
            },
            {
              key: 'google-logging-enabled',
              value: 'true',
            },
          ],
        },
        // Security: Tag for IAP access
        tags: {
          items: ['allow-ssh-iap'],
        },
      },
    });

    // eslint-disable-next-line no-console
    console.log(
      `[ComputeService] Creation started for ${instanceName}. Op ID: ${operation.latestResponse.name}`,
    );
  }

  /**
   * Terminate a GCE VM
   */
  async deleteWorkspaceInstance(
    instanceName: string,
    zone: string,
  ): Promise<void> {
    const [operation] = await this.client.delete({
      project: this.projectId,
      zone,
      instance: instanceName,
    });

    // eslint-disable-next-line no-console
    console.log(
      `[ComputeService] Deletion started for ${instanceName}. Op ID: ${operation.latestResponse.name}`,
    );
  }
}
