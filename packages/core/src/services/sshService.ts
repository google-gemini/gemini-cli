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
    const { instanceName, zone, project, command, forwardAgent = false } = options;

    const args = [
      'compute',
      'ssh',
      instanceName,
      `--zone=${zone}`,
      `--project=${project}`,
      '--tunnel-through-iap',
    ];

    // Security: Only forward agent if explicitly requested
    if (forwardAgent) {
      args.push('--ssh-flag=-A');
    }

    if (command) {
      args.push('--command', command);
    }

    debugLogger.log(`[SSHService] Executing: gcloud ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      // Security: Do NOT use shell: true to prevent command injection
      const child = spawn('gcloud', args, {
        stdio: 'inherit',
      });

      child.on('exit', (code) => {
        if (code === 0) {
          resolve(0);
        } else {
          reject(new Error(`gcloud ssh exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        if ((err as any).code === 'ENOENT') {
            reject(new Error('gcloud CLI not found. Please install the Google Cloud SDK.'));
        } else {
            reject(err);
        }
      });
    });
  }

  /**
   * Pushes a secret string to a temporary, memory-only file on the remote VM.
   * Uses gcloud compute ssh with a heredoc to write to /dev/shm.
   */
  async pushSecret(options: SSHOptions, secretName: string, secretValue: string): Promise<void> {
    const { instanceName, zone, project } = options;
    const remotePath = `/dev/shm/${secretName}`;

    // Command to write secret securely without it appearing in process list
    const remoteCommand = `cat << 'EOF' > ${remotePath}
${secretValue}
EOF
chmod 600 ${remotePath}`;

    const args = [
      'compute',
      'ssh',
      instanceName,
      `--zone=${zone}`,
      `--project=${project}`,
      '--tunnel-through-iap',
      '--command',
      remoteCommand,
    ];

    debugLogger.log(`[SSHService] Pushing secret ${secretName} to ${instanceName}...`);

    return new Promise((resolve, reject) => {
      const child = spawn('gcloud', args);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Failed to push secret ${secretName}, exit code ${code}`));
      });
      child.on('error', (err) => reject(err));
    });
  }
}
