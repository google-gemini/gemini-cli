/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, execFile, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { quote, parse } from 'shell-quote';
import { promisify } from 'node:util';
import { debugLogger } from '../../utils/debugLogger.js';
import { FatalSandboxError } from '../../utils/errors.js';
import { GEMINI_DIR } from '../../utils/paths.js';
import { homedir } from '../../utils/paths.js';
import { type SandboxConfig } from '../../config/config.js';
import { type SandboxDriver, type SandboxMetadata } from '../types.js';
import { BUILTIN_SEATBELT_PROFILES } from '../utils.js';

const execFileAsync = promisify(execFile);

export class MacOSSeatbeltDriver implements SandboxDriver {
  readonly name = 'sandbox-exec';

  async isSupported(): Promise<boolean> {
    if (os.platform() !== 'darwin') {
      return false;
    }
    try {
      await execFileAsync('command', ['-v', 'sandbox-exec']);
      return true;
    } catch {
      return false;
    }
  }

  async prepare(): Promise<void> {
    if (process.env['BUILD_SANDBOX']) {
      throw new FatalSandboxError(
        'Cannot BUILD_SANDBOX when using macOS Seatbelt',
      );
    }
  }

  async spawn(
    _config: SandboxConfig,
    nodeArgs: string[],
    cliArgs: string[],
  ): Promise<ChildProcess> {
    const profile = (process.env['SEATBELT_PROFILE'] ??= 'permissive-open');
    let profileFile = fileURLToPath(
      new URL(`sandbox-macos-${profile}.sb`, import.meta.url),
    );

    if (!BUILTIN_SEATBELT_PROFILES.includes(profile)) {
      profileFile = path.join(GEMINI_DIR, `sandbox-macos-${profile}.sb`);
    }

    if (!fs.existsSync(profileFile)) {
      throw new FatalSandboxError(
        `Missing macos seatbelt profile file '${profileFile}'`,
      );
    }

    debugLogger.log(`using macos seatbelt (profile: ${profile}) ...`);

    const nodeOptions = [
      ...(process.env['DEBUG'] ? ['--inspect-brk'] : []),
      ...nodeArgs,
    ].join(' ');

    const targetDir = fs.realpathSync(process.cwd());
    const tmpDir = fs.realpathSync(os.tmpdir());
    const homeDir = fs.realpathSync(homedir());
    const { stdout: cacheDir } = await execFileAsync('getconf', ['DARWIN_USER_CACHE_DIR']);

    const args = [
      '-D', `TARGET_DIR=${targetDir}`,
      '-D', `TMP_DIR=${tmpDir}`,
      '-D', `HOME_DIR=${homeDir}`,
      '-D', `CACHE_DIR=${cacheDir.trim()}`,
    ];

    // Placeholder for INCLUDE_DIRs (simplified for now, logic to be centralized later if needed)
    for (let i = 0; i < 5; i++) {
      args.push('-D', `INCLUDE_DIR_${i}=/dev/null`);
    }

    args.push(
      '-f',
      profileFile,
      'sh',
      '-c',
      [
        `SANDBOX=sandbox-exec`,
        `NODE_OPTIONS="${nodeOptions}"`,
        ...cliArgs.map((arg) => quote([arg])),
      ].join(' '),
    );

    const proxyCommand = process.env['GEMINI_SANDBOX_PROXY_COMMAND'];
    const sandboxEnv = { ...process.env };

    if (proxyCommand) {
       this.setupProxy(proxyCommand, sandboxEnv);
    }

    process.stdin.pause();
    const sandboxProcess = spawn(this.name, args, {
      stdio: 'inherit',
      env: sandboxEnv,
    });

    return sandboxProcess;
  }

  private setupProxy(proxyCommand: string, sandboxEnv: any) {
    const proxy =
      process.env['HTTPS_PROXY'] ||
      process.env['https_proxy'] ||
      process.env['HTTP_PROXY'] ||
      process.env['http_proxy'] ||
      'http://localhost:8877';
    
    sandboxEnv['HTTPS_PROXY'] = proxy;
    sandboxEnv['https_proxy'] = proxy;
    sandboxEnv['HTTP_PROXY'] = proxy;
    sandboxEnv['http_proxy'] = proxy;

    const parsedProxyCommand = parse(proxyCommand).filter(
      (arg): arg is string => typeof arg === 'string',
    );

    if (parsedProxyCommand.length === 0) {
      throw new FatalSandboxError('Invalid GEMINI_SANDBOX_PROXY_COMMAND');
    }

    const command = parsedProxyCommand.shift()!;
    const proxyProcess = spawn(command, parsedProxyCommand, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    const stopProxy = () => {
      if (proxyProcess?.pid) {
        try {
          process.kill(-proxyProcess.pid, 'SIGTERM');
        } catch {}
      }
    };

    process.on('exit', stopProxy);
    process.on('SIGINT', stopProxy);
    process.on('SIGTERM', stopProxy);

    proxyProcess.stderr?.on('data', (data) => {
      debugLogger.debug(`[PROXY STDERR]: ${data.toString().trim()}`);
    });
  }

  async getMetadata(): Promise<SandboxMetadata> {
    return {
      driverName: this.name,
      isSupported: await this.isSupported(),
      platform: 'darwin',
    };
  }
}
