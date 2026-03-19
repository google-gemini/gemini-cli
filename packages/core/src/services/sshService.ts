/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { debugLogger } from '../utils/debugLogger.js';

export interface SSHOptions {
  instanceName: string;
  zone: string;
  project: string;
  command?: string;
  forwardAgent?: boolean;
}

export class SSHService {
  /**
   * Connect to a GCE instance using gcloud compute ssh with IAP tunneling.
   * This method spawns a child process and inherits stdio to allow interactive shell.
   */
  async connect(options: SSHOptions): Promise<number> {
    const { instanceName, zone, project, command, forwardAgent = true } = options;

    const args = [
      'compute',
      'ssh',
      instanceName,
      `--zone=${zone}`,
      `--project=${project}`,
      '--tunnel-through-iap',
    ];

    if (forwardAgent) {
      args.push('--ssh-flag=-A');
    }

    if (command) {
      args.push('--command', command);
    }

    debugLogger.log(`[SSHService] Executing: gcloud ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      const child = spawn('gcloud', args, {
        stdio: 'inherit',
        shell: true,
      });

      child.on('exit', (code) => {
        if (code === 0) {
          resolve(0);
        } else {
          reject(new Error(`gcloud ssh exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }
}
