/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, execFile, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { parse } from 'shell-quote';
import { promisify } from 'node:util';
import { debugLogger } from '../../utils/debugLogger.js';
import { FatalSandboxError } from '../../utils/errors.js';
import { GEMINI_DIR, homedir } from '../../utils/paths.js';
import { type SandboxConfig } from '../../config/config.js';
import { type SandboxDriver, type SandboxMetadata } from '../types.js';
import {
  getContainerPath,
  shouldUseCurrentUserInSandbox,
  parseImageName,
  getSandboxPorts,
  getSandboxEntrypoint,
  LOCAL_DEV_SANDBOX_IMAGE_NAME,
} from '../utils.js';

const execFileAsync = promisify(execFile);

export abstract class ContainerDriver implements SandboxDriver {
  abstract readonly name: 'docker' | 'podman';

  async isSupported(): Promise<boolean> {
    try {
      await execFileAsync('command', ['-v', this.name]);
      return true;
    } catch {
      return false;
    }
  }

  async prepare(config: SandboxConfig): Promise<void> {
    const { image } = config;
    if (!(await this.ensureSandboxImageIsPresent(image))) {
      throw new FatalSandboxError(
        `Sandbox image '${image}' is missing or could not be pulled.`,
      );
    }
  }

  async spawn(
    config: SandboxConfig,
    nodeArgs: string[],
    cliArgs: string[],
  ): Promise<ChildProcess> {
    const { image } = config;
    const workdir = path.resolve(process.cwd());
    const containerWorkdir = getContainerPath(workdir);

    const args = ['run', '-i', '--rm', '--init', '--workdir', containerWorkdir];

    if (process.env['SANDBOX_FLAGS']) {
      const flags = parse(process.env['SANDBOX_FLAGS'], process.env).filter(
        (f): f is string => typeof f === 'string',
      );
      args.push(...flags);
    }

    if (process.stdin.isTTY) {
      args.push('-t');
    }

    args.push('--add-host', 'host.docker.internal:host-gateway');
    args.push('--volume', `${workdir}:${containerWorkdir}`);

    const userHomeDirOnHost = homedir();
    const userSettingsDirInSandbox = getContainerPath(`/home/node/${GEMINI_DIR}`);
    if (!fs.existsSync(userHomeDirOnHost)) {
      fs.mkdirSync(userHomeDirOnHost, { recursive: true });
    }
    const userSettingsDirOnHost = path.join(userHomeDirOnHost, GEMINI_DIR);
    if (!fs.existsSync(userSettingsDirOnHost)) {
      fs.mkdirSync(userSettingsDirOnHost, { recursive: true });
    }

    args.push('--volume', `${userSettingsDirOnHost}:${userSettingsDirInSandbox}`);
    
    // mount os.tmpdir()
    args.push('--volume', `${os.tmpdir()}:${getContainerPath(os.tmpdir())}`);

    // expose env-specified ports
    getSandboxPorts().forEach((p) => args.push('--publish', `${p}:${p}`));

    const imageName = parseImageName(image);
    const containerName = `${imageName}-${randomBytes(4).toString('hex')}`;
    args.push('--name', containerName, '--hostname', containerName);

    // copy env vars
    const envVarsToForward = [
      'GEMINI_API_KEY',
      'GOOGLE_API_KEY',
      'GOOGLE_GEMINI_BASE_URL',
      'GOOGLE_VERTEX_BASE_URL',
      'GOOGLE_GENAI_USE_VERTEXAI',
      'GOOGLE_GENAI_USE_GCA',
      'GOOGLE_CLOUD_PROJECT',
      'GOOGLE_CLOUD_LOCATION',
      'GEMINI_MODEL',
      'TERM',
      'COLORTERM',
    ];

    for (const envVar of envVarsToForward) {
      if (process.env[envVar]) {
        args.push('--env', `${envVar}=${process.env[envVar]}`);
      }
    }

    // copy NODE_OPTIONS
    const existingNodeOptions = process.env['NODE_OPTIONS'] || '';
    const allNodeOptions = [
      ...(existingNodeOptions ? [existingNodeOptions] : []),
      ...nodeArgs,
    ].join(' ');

    if (allNodeOptions.length > 0) {
      args.push('--env', `NODE_OPTIONS="${allNodeOptions}"`);
    }

    args.push('--env', `SANDBOX=${containerName}`);

    if (this.name === 'podman') {
      const emptyAuthFilePath = path.join(os.tmpdir(), 'empty_auth.json');
      fs.writeFileSync(emptyAuthFilePath, '{}', 'utf-8');
      args.push('--authfile', emptyAuthFilePath);
    }

    const finalEntrypoint = getSandboxEntrypoint(workdir, cliArgs);
    
    if (await shouldUseCurrentUserInSandbox()) {
      args.push('--user', 'root');
      const { stdout: uid } = await execFileAsync('id', ['-u']);
      const { stdout: gid } = await execFileAsync('id', ['-g']);
      const username = 'gemini';
      const homeDir = getContainerPath(homedir());

      const setupUserCommands = [
        `groupadd -f -g ${gid.trim()} ${username}`,
        `id -u ${username} &>/dev/null || useradd -o -u ${uid.trim()} -g ${gid.trim()} -d ${homeDir} -s /bin/bash ${username}`,
      ].join(' && ');

      const originalCommand = finalEntrypoint[2];
      const escapedOriginalCommand = originalCommand.replace(/'/g, "'\\''");
      const suCommand = `su -p ${username} -c '${escapedOriginalCommand}'`;
      finalEntrypoint[2] = `${setupUserCommands} && ${suCommand}`;
      args.push('--env', `HOME=${homedir()}`);
    }

    args.push(image);
    args.push(...finalEntrypoint);

    process.stdin.pause();
    const sandboxProcess = spawn(this.name, args, {
      stdio: 'inherit',
    });

    return sandboxProcess;
  }

  private async ensureSandboxImageIsPresent(image: string): Promise<boolean> {
    if (await this.imageExists(image)) {
      return true;
    }
    if (image === LOCAL_DEV_SANDBOX_IMAGE_NAME) {
      return false;
    }
    return this.pullImage(image);
  }

  private async imageExists(image: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(this.name, ['images', '-q', image]);
      return stdout.trim() !== '';
    } catch {
      return false;
    }
  }

  private async pullImage(image: string): Promise<boolean> {
    try {
      await execFileAsync(this.name, ['pull', image]);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(config?: SandboxConfig): Promise<SandboxMetadata> {
    return {
      driverName: this.name,
      isSupported: await this.isSupported(),
      image: config?.image,
    };
  }
}

export class DockerDriver extends ContainerDriver {
  readonly name = 'docker';
}

export class PodmanDriver extends ContainerDriver {
  readonly name = 'podman';
}
