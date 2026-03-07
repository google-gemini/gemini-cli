/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, execFile, execFileSync, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { debugLogger } from '../../utils/debugLogger.js';
import { FatalSandboxError } from '../../utils/errors.js';
import { type SandboxConfig } from '../../config/config.js';
import { type SandboxDriver, type SandboxMetadata } from '../types.js';
import { getSandboxEntrypoint } from '../utils.js';

const execFileAsync = promisify(execFile);

export class LXCDriver implements SandboxDriver {
  readonly name = 'lxc';

  async isSupported(): Promise<boolean> {
    try {
      await execFileAsync('command', ['-v', 'lxc']);
      return true;
    } catch {
      return false;
    }
  }

  async prepare(config: SandboxConfig): Promise<void> {
    const containerName = config.image || 'gemini-sandbox';
    try {
      const { stdout } = await execFileAsync('lxc', ['list', containerName, '--format=json']);
      const containers = JSON.parse(stdout);
      
      if (!Array.isArray(containers)) {
        throw new Error('Unexpected response format from lxc list: expected an array.');
      }

      const container = containers.find((c: any) => 
        c && typeof c === 'object' && c.name === containerName
      );

      if (!container) {
        throw new Error(`LXC container '${containerName}' not found.`);
      }

      if (container.status?.toLowerCase() !== 'running') {
        throw new Error(`LXC container '${containerName}' is not running (status: ${container.status}).`);
      }
    } catch (err) {
      throw new FatalSandboxError(
        `Failed to query LXC container '${containerName}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async spawn(
    config: SandboxConfig,
    nodeArgs: string[],
    cliArgs: string[],
  ): Promise<ChildProcess> {
    const containerName = config.image || 'gemini-sandbox';
    const workdir = path.resolve(process.cwd());

    const deviceName = `gemini-workspace-${randomBytes(4).toString('hex')}`;
    await execFileAsync('lxc', [
      'config',
      'device',
      'add',
      containerName,
      deviceName,
      'disk',
      `source=${workdir}`,
      `path=${workdir}`,
    ]);

    process.on('exit', () => {
      try {
        execFileSync('lxc', ['config', 'device', 'remove', containerName, deviceName], { timeout: 2000 });
      } catch {}
    });

    const envArgs: string[] = [];
    // (Simplified env forwarding, same as ContainerDriver)
    const envVarsToForward = ['GEMINI_API_KEY', 'TERM', 'SANDBOX'];
    for (const envVar of envVarsToForward) {
      if (process.env[envVar]) {
        envArgs.push('--env', `${envVar}=${process.env[envVar]}`);
      }
    }

    const finalEntrypoint = getSandboxEntrypoint(workdir, cliArgs);
    const args = ['exec', containerName, '--cwd', workdir, ...envArgs, '--', ...finalEntrypoint];

    process.stdin.pause();
    return spawn('lxc', args, { stdio: 'inherit' });
  }

  async getMetadata(config?: SandboxConfig): Promise<SandboxMetadata> {
    return {
      driverName: this.name,
      isSupported: await this.isSupported(),
      image: config?.image,
    };
  }
}
