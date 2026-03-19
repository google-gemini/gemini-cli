/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'child_process';
import os from 'os';

/**
 * Centralized SSH/RSYNC management for GCE Workers.
 * Handles Magic Hostname routing with Zero-Knowledge security.
 * STRICTLY uses Direct Internal connection (Corporate Magic).
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
      '-o', 'ConnectTimeout=60',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'SendEnv=USER',
      '-i', `${os.homedir()}/.ssh/google_compute_engine`
    ];
  }

  getRunCommand(command: string, options: { interactive?: boolean } = {}): string {
    const fullRemote = this.getMagicRemote();
    return `ssh ${this.getCommonArgs().join(' ')} ${options.interactive ? '-t' : ''} ${fullRemote} ${this.quote(command)}`;
  }

  run(command: string, options: { interactive?: boolean; stdio?: 'pipe' | 'inherit' } = {}): { status: number; stdout: string; stderr: string } {
    const sshCmd = this.getRunCommand(command, options);
    const res = spawnSync(sshCmd, { stdio: options.stdio || 'pipe', shell: true });
    return { 
      status: res.status ?? 1, 
      stdout: res.stdout?.toString() || '', 
      stderr: res.stderr?.toString() || '' 
    };
  }

  sync(localPath: string, remotePath: string, options: { delete?: boolean; exclude?: string[]; sudo?: boolean } = {}): number {
    const fullRemote = this.getMagicRemote();
    // We use --no-t and --no-perms to avoid "Operation not permitted" errors 
    // when syncing to volumes that might have UID mismatches with the container.
    const rsyncArgs = ['-rvz', '--quiet', '--no-t', '--no-perms', '--no-owner', '--no-group'];
    if (options.delete) rsyncArgs.push('--delete');
    if (options.exclude) options.exclude.forEach(ex => rsyncArgs.push(`--exclude="${ex}"`));
    
    // Use sudo on the remote side if requested to bypass permission errors
    if (options.sudo) {
        rsyncArgs.push('--rsync-path="sudo rsync"');
    }

    const sshCmd = `ssh ${this.getCommonArgs().join(' ')}`;
    const directRsync = `rsync ${rsyncArgs.join(' ')} -e ${this.quote(sshCmd)} ${localPath} ${fullRemote}:${remotePath}`;
    
    const res = spawnSync(directRsync, { stdio: 'inherit', shell: true });
    return res.status ?? 1;
  }

  private quote(str: string) {
    return `'${str.replace(/'/g, "'\\''")}'`;
  }
}
