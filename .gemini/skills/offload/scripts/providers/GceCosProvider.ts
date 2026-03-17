/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { WorkerProvider, SetupOptions, ExecOptions, SyncOptions, WorkerStatus } from './BaseProvider.ts';
import { GceConnectionManager } from './GceConnectionManager.ts';

export class GceCosProvider implements WorkerProvider {
  private projectId: string;
  private zone: string;
  private instanceName: string;
  private sshConfigPath: string;
  private knownHostsPath: string;
  private sshAlias = 'gcli-worker';
  private conn: GceConnectionManager;

  constructor(projectId: string, zone: string, instanceName: string, repoRoot: string) {
    this.projectId = projectId;
    this.zone = zone;
    this.instanceName = instanceName;
    const offloadDir = path.join(repoRoot, '.gemini/offload');
    if (!fs.existsSync(offloadDir)) fs.mkdirSync(offloadDir, { recursive: true });
    this.sshConfigPath = path.join(offloadDir, 'ssh_config');
    this.knownHostsPath = path.join(offloadDir, 'known_hosts');
    this.conn = new GceConnectionManager(projectId, zone, instanceName);
  }

  async provision(): Promise<number> {
    const imageUri = 'us-docker.pkg.dev/gemini-code-dev/gemini-cli/maintainer:latest';
    const region = this.zone.split('-').slice(0, 2).join('-');
    const vpcName = 'iap-vpc';
    const subnetName = 'iap-subnet';

    console.log(`🏗️  Ensuring "Magic" Network Infrastructure in ${this.projectId}...`);

    const vpcCheck = spawnSync('gcloud', ['compute', 'networks', 'describe', vpcName, '--project', this.projectId], { stdio: 'pipe' });
    if (vpcCheck.status !== 0) {
        spawnSync('gcloud', ['compute', 'networks', 'create', vpcName, '--project', this.projectId, '--subnet-mode=custom'], { stdio: 'inherit' });
    }

    const subnetCheck = spawnSync('gcloud', ['compute', 'networks', 'subnets', 'describe', subnetName, '--project', this.projectId, '--region', region], { stdio: 'pipe' });
    if (subnetCheck.status !== 0) {
        spawnSync('gcloud', ['compute', 'networks', 'subnets', 'create', subnetName, 
            '--project', this.projectId, '--network', vpcName, '--region', region, 
            '--range=10.0.0.0/24', '--enable-private-ip-google-access'], { stdio: 'inherit' });
    } else {
        spawnSync('gcloud', ['compute', 'networks', 'subnets', 'update', subnetName, '--project', this.projectId, '--region', region, '--enable-private-ip-google-access'], { stdio: 'pipe' });
    }

    const fwCheck = spawnSync('gcloud', ['compute', 'firewall-rules', 'describe', 'allow-corporate-ssh', '--project', this.projectId], { stdio: 'pipe' });
    if (fwCheck.status !== 0) {
        spawnSync('gcloud', ['compute', 'firewall-rules', 'create', 'allow-corporate-ssh', 
            '--project', this.projectId, '--network', vpcName, '--allow=tcp:22', '--source-ranges=0.0.0.0/0'], { stdio: 'inherit' });
    }

    console.log(`🚀 Provisioning GCE COS worker: ${this.instanceName}...`);

    const startupScript = `#!/bin/bash
      set -e
      echo "🚀 Starting Maintainer Worker Resilience Loop..."
      
      # Wait for Docker to be ready
      until docker info >/dev/null 2>&1; do echo "Waiting for docker..."; sleep 2; done

      # Pull with retries
      for i in {1..5}; do
        docker pull ${imageUri} && break || (echo "Pull failed, retry $i..." && sleep 5)
      done

      # Run if not already exists
      if ! docker ps -a | grep -q "maintainer-worker"; then
        docker run -d --name maintainer-worker --restart always \\
          -v ~/.offload:/home/node/.offload:rw \\
          -v ~/dev:/home/node/dev:rw \\
          -v ~/.gemini:/home/node/.gemini:rw \\
          ${imageUri} /bin/bash -c "while true; do sleep 1000; done"
      fi
      echo "✅ Maintainer Worker is active."
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
      '--network-interface', `network=${vpcName},subnet=${subnetName},no-address`,
      '--scopes', 'https://www.googleapis.com/auth/cloud-platform',
      '--quiet'
    ], { stdio: 'inherit' });

    if (result.status === 0) {
      console.log('⏳ Waiting for OS Login and SSH to initialize (this takes ~45s)...');
      await new Promise(r => setTimeout(r, 45000));
    }

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
      
      console.log('⏳ Waiting for boot...');
      await new Promise(r => setTimeout(r, 20000));
    }

    // NEW: Verify the container is actually running
    console.log('   - Verifying remote container health...');
    const containerCheck = await this.getExecOutput('sudo docker ps -q --filter "name=maintainer-worker"');
    
    if (containerCheck.status !== 0 || !containerCheck.stdout.trim()) {
        console.log('   ⚠️ Container missing or stopped. Attempting emergency restart...');
        const imageUri = 'us-docker.pkg.dev/gemini-code-dev/gemini-cli/maintainer:latest';
        const recoverCmd = `sudo docker pull ${imageUri} && (sudo docker rm -f maintainer-worker || true) && sudo docker run -d --name maintainer-worker --restart always -v ~/.offload:/home/node/.offload:rw -v ~/dev:/home/node/dev:rw -v ~/.gemini:/home/node/.gemini:rw ${imageUri} /bin/bash -c "while true; do sleep 1000; done"`;
        const recoverRes = await this.exec(recoverCmd);
        if (recoverRes !== 0) {
            console.error('   ❌ Critical: Failed to recover maintainer container.');
            return 1;
        }
        console.log('   ✅ Container recovered.');
    }

    return 0;
  }

  async setup(options: SetupOptions): Promise<number> {
    const dnsSuffix = options.dnsSuffix || '.internal.gcpnode.com';
    const internalHostname = `nic0.${this.instanceName}.${this.zone}.c.${this.projectId}${dnsSuffix.startsWith('.') ? dnsSuffix : '.' + dnsSuffix}`;
    const user = `${process.env.USER || 'node'}_google_com`;

    const sshEntry = `
Host ${this.sshAlias}
    HostName ${internalHostname}
    IdentityFile ~/.ssh/google_compute_engine
    User ${user}
    UserKnownHostsFile /dev/null
    CheckHostIP no
    StrictHostKeyChecking no
    ConnectTimeout 15
`;

    fs.writeFileSync(this.sshConfigPath, sshEntry);
    console.log(`   ✅ Created project SSH config: ${this.sshConfigPath}`);

    console.log('   - Verifying direct connection (may trigger corporate SSO prompt)...');
    const res = this.conn.run('echo 1');
    if (res.status !== 0) {
        console.error('\n❌ All connection attempts failed. Please ensure you have "gcert" and IAP permissions.');
        return 1;
    }
    console.log('   ✅ Connection verified.');
    return 0;
  }

  getRunCommand(command: string, options: ExecOptions = {}): string {
    let finalCmd = command;
    if (options.wrapContainer) {
        finalCmd = `sudo docker exec ${options.interactive ? '-it' : ''} ${options.cwd ? `-w ${options.cwd}` : ''} ${options.wrapContainer} sh -c ${this.quote(command)}`;
    }
    return this.conn.getRunCommand(finalCmd, { interactive: options.interactive });
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

    return this.conn.run(finalCmd, { interactive: options.interactive, stdio: options.interactive ? 'inherit' : 'pipe' });
  }

  async sync(localPath: string, remotePath: string, options: SyncOptions = {}): Promise<number> {
    console.log(`📦 Syncing ${localPath} to remote:${remotePath}...`);
    return this.conn.sync(localPath, remotePath, options);
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
