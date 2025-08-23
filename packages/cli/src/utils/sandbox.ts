/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as helpers from './sandbox_helpers.js';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Public API used by the rest of the CLI for sandbox setup. */
export function startSandboxProxyIfConfigured(): ChildProcess | undefined {
  try {
    const cp = helpers.safeSpawnProxy();
    return cp;
  } catch (err) {
    console.error('Error starting sandbox proxy:', err);
    return undefined;
  }
}

export {
  parseAndFilterSandboxEnv,
  buildSafeEnv,
  parseCommandString,
  safeSpawnProxy,
} from './sandbox_helpers.js';

// Compatibility export for existing code
export async function start_sandbox(
  config: SandboxConfig,
  nodeArgs: string[] = [],
  cliConfig?: Config,
  cliArgs: string[] = [],
): Promise<void> {
  const patcher = new ConsolePatcher({
    debugMode: cliConfig?.getDebugMode() || !!process.env['DEBUG'],
    stderr: true,
  });
  patcher.patch();

  try {
    if (config.command === 'sandbox-exec') {
      // disallow BUILD_SANDBOX
      if (process.env['BUILD_SANDBOX']) {
        console.error('ERROR: cannot BUILD_SANDBOX when using macOS Seatbelt');
        process.exit(1);
      }

      const profile = (process.env['SEATBELT_PROFILE'] ??= 'permissive-open');
      let profileFile = fileURLToPath(
        new URL(`sandbox-macos-${profile}.sb`, import.meta.url),
      );

      if (!BUILTIN_SEATBELT_PROFILES.includes(profile)) {
        profileFile = path.join(
          SETTINGS_DIRECTORY_NAME,
          `sandbox-macos-${profile}.sb`,
        );
      }
      if (!fs.existsSync(profileFile)) {
        console.error(
          `ERROR: missing macos seatbelt profile file '${profileFile}'`,
        );
        process.exit(1);
      }

      console.error(`using macos seatbelt (profile: ${profile}) ...`);

      const nodeOptions = [
        ...(process.env['DEBUG'] ? ['--inspect-brk'] : []),
        ...nodeArgs,
      ].join(' ');

      const args = [
        '-D',
        `TARGET_DIR=${fs.realpathSync(process.cwd())}`,
        '-D',
        `TMP_DIR=${fs.realpathSync(os.tmpdir())}`,
        '-D',
        `HOME_DIR=${fs.realpathSync(os.homedir())}`,
        '-D',
        `CACHE_DIR=${fs
          .realpathSync(execSync(`getconf DARWIN_USER_CACHE_DIR`).toString().trim())}`,
      ];

      // Add include dirs
      const MAX_INCLUDE_DIRS = 5;
      const targetDir = fs.realpathSync(cliConfig?.getTargetDir() || '');
      const includedDirs: string[] = [];

      if (cliConfig) {
        const workspaceContext = cliConfig.getWorkspaceContext();
        for (const dir of workspaceContext.getDirectories()) {
          const realDir = fs.realpathSync(dir);
          if (realDir !== targetDir) includedDirs.push(realDir);
        }
      }

      for (let i = 0; i < MAX_INCLUDE_DIRS; i++) {
        args.push(
          '-D',
          `INCLUDE_DIR_${i}=${includedDirs[i] ?? '/dev/null'}`,
        );
      }

      const finalArgv = cliArgs;

      args.push(
        '-f',
        profileFile,
        'sh',
        '-c',
        [
          `SANDBOX=sandbox-exec`,
          `NODE_OPTIONS="${nodeOptions}"`,
          ...finalArgv.map((arg) => quote([arg])),
        ].join(' '),
      );

      // --- secure proxy setup via helpers ---
      const sandboxEnv = helpers.buildSafeEnv(process.env);
      const proxyProcess = helpers.safeSpawnProxy();

      if (proxyProcess) {
        await new Promise<void>((resolve, reject) => {
          proxyProcess.on('error', reject);
          proxyProcess.on('close', (code) =>
            code === 0
              ? resolve()
              : reject(new Error(`Proxy exited with code ${code}`)),
          );
        });
      }

      const sandboxProcess = spawn(config.command, args, {
        stdio: 'inherit',
        env: sandboxEnv,
      });

      await new Promise((resolve) =>
        sandboxProcess.on('close', resolve),
      );
      return;
    }

    console.error(`hopping into sandbox (command: ${config.command}) ...`);

    const gcPath = fs.realpathSync(process.argv[1]);
    const projectSandboxDockerfile = path.join(
      SETTINGS_DIRECTORY_NAME,
      'sandbox.Dockerfile',
    );
    const isCustomProjectSandbox = fs.existsSync(projectSandboxDockerfile);

    const image = config.image;
    const workdir = path.resolve(process.cwd());
    const containerWorkdir = getContainerPath(workdir);

    // if BUILD_SANDBOX is set, then call scripts/build_sandbox.js
    if (process.env['BUILD_SANDBOX']) {
      if (!gcPath.includes('gemini-cli/packages/')) {
        console.error(
          'ERROR: cannot build sandbox using installed binary; ' +
            'use `npm link ./packages/cli` in gemini-cli repo.',
        );
        process.exit(1);
      }
      const buildScript = path.join(
        gcPath,
        '../../scripts/build_sandbox.js',
      );
      console.error('building sandbox image...');
      execSync(`node ${buildScript}`, { stdio: 'inherit' });
    }

    // construct docker args
    const dockerArgs = [
      'run',
      '--rm',
      '-it',
      '-v',
      `${workdir}:${containerWorkdir}`,
      '-w',
      containerWorkdir,
      ...(isCustomProjectSandbox
        ? ['-f', projectSandboxDockerfile]
        : []),
      image,
      ...cliArgs,
    ];

    // --- Docker sandbox with safe env ---
    const dockerEnv = helpers.buildSafeEnv(process.env);
    const dockerProcess = spawn('docker', dockerArgs, {
      stdio: 'inherit',
      env: dockerEnv,
    });

    await new Promise((resolve) =>
      dockerProcess.on('close', resolve),
    );
  } catch (err) {
    console.error('Error starting sandbox:', err);
  }
}
