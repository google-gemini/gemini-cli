/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { debugLogger } from '../utils/debugLogger.js';
import { Storage } from '../config/storage.js';

export interface SyncOptions {
  instanceName: string;
  zone: string;
  project: string;
}

export class SyncService {
  /**
   * Push local ~/.gemini directory to the remote workspace.
   * Currently uses gcloud compute scp.
   */
  async pushSettings(options: SyncOptions): Promise<void> {
    const { instanceName, zone, project } = options;
    const localDir = Storage.getGlobalGeminiDir();
    
    // We want to sync the contents of ~/.gemini to ~/.gemini on the remote.
    // gcloud compute scp local-dir remote-instance:remote-dir
    const remotePath = `${instanceName}:.gemini`;

    // Note: gcloud scp doesn't have a native "exclude" flag like rsync, 
    // so we might need to be selective or use a tarball approach if it's too slow.
    // For v1, we just push the whole thing but excluding the 'tmp' and 'logs' folder if possible
    // via a manual scp of subdirectories, or just the whole thing for simplicity now.
    
    const args = [
      'compute',
      'scp',
      '--recurse',
      localDir,
      remotePath,
      `--zone=${zone}`,
      `--project=${project}`,
      '--tunnel-through-iap',
    ];

    debugLogger.log(`[SyncService] Syncing settings: gcloud ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      const child = spawn('gcloud', args, {
        stdio: 'inherit',
      });

      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`gcloud scp exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }
}
