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
    
    // Fix: Ensure files are placed in the .gemini directory on the remote
    const remotePath = `${instanceName}:.gemini/`;

    // Performance/Robustness: Exclude large and local-only folders.
    // Since gcloud scp doesn't support --exclude, we could either:
    // 1. scp specific sub-folders (settings.json, commands, skills, policies)
    // 2. Use a temporary tarball on the local side, scp it, and extract remotely.
    // For now, let's just sync the essential sub-directories to keep it fast.
    
    const essentials = ['settings.json', 'commands', 'skills', 'policies', 'memory.md'];
    
    debugLogger.log(`[SyncService] Syncing essential settings to ${instanceName}...`);

    for (const item of essentials) {
        const localItem = `${localDir}/${item}`;
        const args = [
            'compute',
            'scp',
            '--recurse',
            localItem,
            remotePath,
            `--zone=${zone}`,
            `--project=${project}`,
            '--tunnel-through-iap',
        ];

        await new Promise<void>((resolve, reject) => {
            const child = spawn('gcloud', args, { stdio: 'ignore' });
            child.on('exit', (code) => {
                if (code === 0) resolve();
                else debugLogger.warn(`[SyncService] Failed to sync ${item}, skipping...`);
                resolve(); // Don't fail the whole sync if one item fails
            });
            child.on('error', (err) => {
                debugLogger.error(`[SyncService] Error syncing ${item}:`, err);
                resolve();
            });
        });
    }
  }
}
