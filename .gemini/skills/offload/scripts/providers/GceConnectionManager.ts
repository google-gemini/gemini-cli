/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'child_process';
import os from 'os';

/**
 * Centralized SSH/RSYNC management for GCE Workers.
 * Handles Magic Hostname routing, Zero-Knowledge security, and IAP Fallbacks.
 */
export class GceConnectionManager {
  private projectId: string;
  private zone: string;
  private instanceName: string;

  constructor(projectId: string, zone: string, instanceName: string) {
    this.projectId = projectId;
    this.zone = zone;
    this.instanceName = instanceName;
  }

  getMagicRemote(): string {
    const user = `${process.env.USER || 'node'}_google_com`;
    const dnsSuffix = '.internal.gcpnode.com';
    return `${user}@nic0.${this.instanceName}.${this.zone}.c.${this.projectId}${dnsSuffix}`;
  }

  getCommonArgs(): string[] {
    return [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'LogLevel=ERROR',
      '-o', 'ConnectTimeout=15',
      '-i', `${os.homedir()}/.ssh/google_compute_engine`
    ];
  }

  getRunCommand(command: string, options: { interactive?: boolean } = {}): string {
    const fullRemote = this.getMagicRemote();
    return `ssh ${this.getCommonArgs().join(' ')} ${options.interactive ? '-t' : ''} ${fullRemote} ${this.quote(command)}`;
  }

  run(command: string, options: { interactive?: boolean; stdio?: 'pipe' | 'inherit' } = {}): { status: number; stdout: string; stderr: string } {
    const sshCmd = this.getRunCommand(command, options);

    // 1. Try Direct Path
    const directRes = spawnSync(sshCmd, { stdio: options.stdio || 'pipe', shell: true });
    if (directRes.status === 0) {
      return { 
        status: 0, 
        stdout: directRes.stdout?.toString() || '', 
        stderr: directRes.stderr?.toString() || '' 
      };
    }

    // 2. Try IAP Fallback
    const iapCmd = `gcloud compute ssh ${this.instanceName} --project ${this.projectId} --zone ${this.zone} --tunnel-through-iap --command ${this.quote(command)}`;
    const iapRes = spawnSync(iapCmd, { stdio: options.stdio || 'pipe', shell: true });
    return {
      status: iapRes.status ?? 1,
      stdout: iapRes.stdout?.toString() || '',
      stderr: iapRes.stderr?.toString() || ''
    };
  }

  sync(localPath: string, remotePath: string, options: { delete?: boolean; exclude?: string[] } = {}): number {
    const fullRemote = this.getMagicRemote();
    const rsyncArgs = ['-avz', '--quiet'];
    if (options.delete) rsyncArgs.push('--delete');
    if (options.exclude) options.exclude.forEach(ex => rsyncArgs.push(`--exclude="${ex}"`));

    // Ensure remote directory exists
    const remoteParent = remotePath.endsWith('/') ? remotePath : remotePath.substring(0, remotePath.lastIndexOf('/'));
    if (remoteParent) {
        const mkdirRes = this.run(`mkdir -p ${remoteParent}`);
        if (mkdirRes.status !== 0) {
            console.error(`   ❌ Failed to create remote directory ${remoteParent}: ${mkdirRes.stderr}`);
            // We continue anyway as it might be a permission false positive on some OSs
        }
    }

    const sshCmd = `ssh ${this.getCommonArgs().join(' ')}`;
    const directRsync = `rsync ${rsyncArgs.join(' ')} -e ${this.quote(sshCmd)} ${localPath} ${fullRemote}:${remotePath}`;
    
    console.log(`   - Attempting direct sync...`);
    const directRes = spawnSync(directRsync, { stdio: 'inherit', shell: true });
    if (directRes.status === 0) return 0;

    console.log(`   ⚠️ Direct sync failed, attempting IAP fallback...`);
    const iapSshCmd = `gcloud compute ssh --project ${this.projectId} --zone ${this.zone} --tunnel-through-iap --quiet`;
    const iapRsync = `rsync ${rsyncArgs.join(' ')} -e ${this.quote(iapSshCmd)} ${localPath} ${this.instanceName}:${remotePath}`;
    const iapRes = spawnSync(iapRsync, { stdio: 'inherit', shell: true });
    
    return iapRes.status ?? 1;
  }

  private quote(str: string) {
    return `'${str.replace(/'/g, "'\\''")}'`;
  }
}
