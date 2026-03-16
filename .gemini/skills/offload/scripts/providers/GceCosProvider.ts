/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { WorkerProvider, SetupOptions, ExecOptions, SyncOptions, WorkerStatus } from './BaseProvider.ts';

export class GceCosProvider implements WorkerProvider {
  private projectId: string;
  private zone: string;
  private instanceName: string;
  private sshConfigPath: string;
  private knownHostsPath: string;
  private sshAlias = 'gcli-worker';

  constructor(projectId: string, zone: string, instanceName: string, repoRoot: string) {
    this.projectId = projectId;
    this.zone = zone;
    this.instanceName = instanceName;
    this.sshConfigPath = path.join(repoRoot, '.gemini/offload_ssh_config');
    this.knownHostsPath = path.join(repoRoot, '.gemini/offload_known_hosts');
  }

  async provision(): Promise<number> {
    const imageUri = 'us-docker.pkg.dev/gemini-code-dev/gemini-cli/maintainer:latest';
    console.log(`🚀 Provisioning GCE COS worker: ${this.instanceName}...`);

    const startupScript = `#!/bin/bash
      docker pull ${imageUri}
      docker run -d --name maintainer-worker --restart always \\
        -v /home/node/dev:/home/node/dev:rw \\
        -v /home/node/.gemini:/home/node/.gemini:rw \\
        -v /home/node/.offload:/home/node/.offload:rw \\
        ${imageUri} /bin/bash -c "while true; do sleep 1000; done"
    `;

    const result = spawnSync('gcloud', [
      'compute', 'instances', 'create', this.instanceName,
      '--project', this.projectId,
      '--zone', this.zone,
      '--machine-type', 'n2-standard-8',
      '--image-family', 'cos-stable',
      '--image-project', 'cos-cloud',
      '--boot-disk-size', '200GB',
      '--boot-disk-type', 'pd-balanced',
      '--metadata', `startup-script=${startupScript},enable-oslogin=TRUE`,
      '--network-interface', 'network-tier=PREMIUM,no-address',
      '--scopes', 'https://www.googleapis.com/auth/cloud-platform'
    ], { stdio: 'inherit' });

    return result.status ?? 1;
  }

  async ensureReady(): Promise<number> {
    const status = await this.getStatus();
    if (status.status !== 'RUNNING') {
      console.log(`⚠️ Worker ${this.instanceName} is ${status.status}. Waking it up...`);
      const res = spawnSync('gcloud', [
        'compute', 'instances', 'start', this.instanceName,
        '--project', this.projectId,
        '--zone', this.zone
      ], { stdio: 'inherit' });
      if (res.status !== 0) return res.status ?? 1;
    }
    return 0;
  }

  async setup(options: SetupOptions): Promise<number> {
    const dnsSuffix = options.dnsSuffix || '.internal';
    
    // Construct hostname. We attempt direct internal first.
    // We've removed 'nic0' by default as it was reported as inconsistent.
    const internalHostname = `${this.instanceName}.${this.zone}.c.${this.projectId}${dnsSuffix.startsWith('.') ? dnsSuffix : '.' + dnsSuffix}`;

    const sshEntry = `
Host ${this.sshAlias}
    HostName ${internalHostname}
    IdentityFile ~/.ssh/google_compute_engine
    User ${process.env.USER || 'node'}_google_com
    UserKnownHostsFile ${this.knownHostsPath}
    CheckHostIP no
    StrictHostKeyChecking no
    ConnectTimeout 5
`;

    fs.writeFileSync(this.sshConfigPath, sshEntry);
    console.log(`   ✅ Created project SSH config: ${this.sshConfigPath}`);

    console.log('   - Verifying connection and triggering SSO...');
    const directCheck = spawnSync('ssh', ['-F', this.sshConfigPath, this.sshAlias, 'echo 1'], { stdio: 'pipe', shell: true });
    
    if (directCheck.status !== 0) {
      console.log('   ⚠️ Direct internal SSH failed. Attempting IAP tunnel fallback...');
      const iapCheck = spawnSync('gcloud', [
        'compute', 'ssh', this.instanceName,
        '--project', this.projectId,
        '--zone', this.zone,
        '--tunnel-through-iap',
        '--command', 'echo 1'
      ], { stdio: 'inherit' });

      if (iapCheck.status !== 0) {
        console.error('\n❌ All connection attempts failed. Please ensure you have "gcert" and IAP permissions.');
        return 1;
      }
      console.log('   ✅ IAP connection verified.');
    } else {
      console.log('   ✅ Direct internal connection verified.');
    }

    return 0;
  }

  async exec(command: string, options: ExecOptions = {}): Promise<number> {
    const res = await this.getExecOutput(command, options);
    return res.status;
  }

  async getExecOutput(command: string, options: ExecOptions = {}): Promise<{ status: number; stdout: string; stderr: string }> {
    let finalCmd = command;
    if (options.wrapContainer) {
        finalCmd = `docker exec ${options.interactive ? '-it' : ''} ${options.cwd ? `-w ${options.cwd}` : ''} ${options.wrapContainer} sh -c ${this.quote(command)}`;
    }

    const sshBase = ['ssh', '-F', this.sshConfigPath, options.interactive ? '-t' : '', this.sshAlias].filter(Boolean);
    const iapBase = [
        'gcloud', 'compute', 'ssh', this.instanceName,
        '--project', this.projectId,
        '--zone', this.zone,
        '--tunnel-through-iap',
        '--command'
    ];

    // Try direct first
    const directRes = spawnSync(sshBase[0], [...sshBase.slice(1), finalCmd], { stdio: options.interactive ? 'inherit' : 'pipe', shell: true });
    if (directRes.status === 0) {
      return { 
        status: 0, 
        stdout: directRes.stdout?.toString() || '', 
        stderr: directRes.stderr?.toString() || '' 
      };
    }

    console.log('⚠️ Direct SSH failed, falling back to IAP...');
    const iapRes = spawnSync(iapBase[0], [...iapBase.slice(1), finalCmd], { stdio: options.interactive ? 'inherit' : 'pipe' });
    return { 
      status: iapRes.status ?? 1, 
      stdout: iapRes.stdout?.toString() || '', 
      stderr: iapRes.stderr?.toString() || '' 
    };
  }

  async sync(localPath: string, remotePath: string, options: SyncOptions = {}): Promise<number> {
    const rsyncArgs = ['-avz', '--exclude=".gemini/settings.json"'];
    if (options.delete) rsyncArgs.push('--delete');
    if (options.exclude) {
      options.exclude.forEach(ex => rsyncArgs.push(`--exclude=${ex}`));
    }

    const sshCmd = `ssh -F ${this.sshConfigPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=${this.knownHostsPath}`;
    
    // Try direct rsync
    console.log(`📦 Syncing ${localPath} to ${this.sshAlias}:${remotePath}...`);
    const directRes = spawnSync('rsync', [...rsyncArgs, '-e', sshCmd, localPath, `${this.sshAlias}:${remotePath}`], { stdio: 'inherit', shell: true });
    
    if (directRes.status === 0) return 0;

    console.log('⚠️ Direct rsync failed, falling back to IAP-tunnelled rsync...');
    const iapSshCmd = `gcloud compute ssh --project ${this.projectId} --zone ${this.zone} --tunnel-through-iap --quiet`;
    const iapRes = spawnSync('rsync', [...rsyncArgs, '-e', iapSshCmd, localPath, `${this.instanceName}:${remotePath}`], { stdio: 'inherit', shell: true });
    
    return iapRes.status ?? 1;
  }

  async getStatus(): Promise<WorkerStatus> {
    const res = spawnSync('gcloud', [
      'compute', 'instances', 'describe', this.instanceName,
      '--project', this.projectId,
      '--zone', this.zone,
      '--format', 'json(name,status,networkInterfaces[0].networkIP)'
    ], { stdio: 'pipe' });

    if (res.status !== 0) {
      return { name: this.instanceName, status: 'UNKNOWN' };
    }

    try {
      const data = JSON.parse(res.stdout.toString());
      return {
        name: data.name,
        status: data.status,
        internalIp: data.networkInterfaces?.[0]?.networkIP
      };
    } catch (e) {
      return { name: this.instanceName, status: 'ERROR' };
    }
  }

  async stop(): Promise<number> {
    const res = spawnSync('gcloud', [
      'compute', 'instances', 'stop', this.instanceName,
      '--project', this.projectId,
      '--zone', this.zone
    ], { stdio: 'inherit' });
    return res.status ?? 1;
  }

  private quote(str: string) {
    return `'${str.replace(/'/g, "'\\''")}'`;
  }
}
