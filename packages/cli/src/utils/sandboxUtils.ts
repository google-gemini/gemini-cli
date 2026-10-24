/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { quote } from 'shell-quote';
import { debugLogger, GEMINI_DIR } from '@google/gemini-cli-core';

export const LOCAL_DEV_SANDBOX_IMAGE_NAME = 'gemini-cli-sandbox';
export const SANDBOX_NETWORK_NAME = 'gemini-cli-sandbox';
export const SANDBOX_PROXY_NAME = 'gemini-cli-sandbox-proxy';
export const BUILTIN_SEATBELT_PROFILES = [
  'permissive-open',
  'permissive-proxied',
  'restrictive-open',
  'restrictive-proxied',
  'strict-open',
  'strict-proxied',
];

export function getContainerPath(hostPath: string): string {
  if (os.platform() !== 'win32') {
    return hostPath;
  }

  const withForwardSlashes = hostPath.replace(/\\/g, '/');
  const match = withForwardSlashes.match(/^([A-Z]):\/(.*)/i);
  if (match) {
    return `/${match[1].toLowerCase()}/${match[2]}`;
  }
  return withForwardSlashes;
}

export async function shouldUseCurrentUserInSandbox(): Promise<boolean> {
  const envVar = process.env['SANDBOX_SET_UID_GID']?.toLowerCase().trim();

  if (envVar === '1' || envVar === 'true') {
    return true;
  }
  if (envVar === '0' || envVar === 'false') {
    return false;
  }

  // If environment variable is not explicitly set, check for Debian/Ubuntu Linux
  if (os.platform() === 'linux') {
    try {
      const osReleaseContent = await readFile('/etc/os-release', 'utf8');
      const isSupportedDistro =
        osReleaseContent.match(
          /^ID=["']?(?:debian|ubuntu|nixos|arch|fedora|suse|opensuse)/m,
        ) ||
        osReleaseContent.match(
          /^ID_LIKE=["']?.*(?:debian|ubuntu|arch|fedora|suse).*/m,
        );

      if (isSupportedDistro) {
        debugLogger.log(
          'Defaulting to use current user UID/GID for supported Linux distribution.',
        );
        return true;
      }

      // If we're on Linux but the distro is unrecognized, check for a UID mismatch
      // that might cause permission issues in the sandbox.
      const uid = os.userInfo().uid;
      if (uid !== 1000 && uid !== 0) {
        debugLogger.warn(
          `Warning: Host UID mismatch detected (current UID: ${uid}). ` +
            'If you encounter permission errors in the sandbox, try setting SANDBOX_SET_UID_GID=true.',
        );
      }
    } catch {
      // Silently ignore if /etc/os-release is not found or unreadable.
      // The default (false) will be applied in this case.
      debugLogger.warn(
        'Warning: Could not read /etc/os-release to auto-detect Linux distribution for UID/GID default.',
      );
    }
  }
  return false; // Default to false if no other condition is met
}

export function parseImageName(image: string): string {
  const [fullName, tag] = image.split(':');
  const name = fullName.split('/').at(-1) ?? 'unknown-image';
  return tag ? `${name}-${tag}` : name;
}

export function ports(): string[] {
  return (process.env['SANDBOX_PORTS'] ?? '')
    .split(',')
    .filter((p) => p.trim())
    .map((p) => p.trim());
}

export function entrypoint(workdir: string, cliArgs: string[]): string[] {
  const isWindows = os.platform() === 'win32';
  const containerWorkdir = getContainerPath(workdir);
  const shellCmds = [];
  const pathSeparator = isWindows ? ';' : ':';

  let pathSuffix = '';
  if (process.env['PATH']) {
    const paths = process.env['PATH'].split(pathSeparator);
    for (const p of paths) {
      const containerPath = getContainerPath(p);
      if (
        containerPath.toLowerCase().startsWith(containerWorkdir.toLowerCase())
      ) {
        pathSuffix += `:${containerPath}`;
      }
    }
  }
  if (pathSuffix) {
    shellCmds.push(`export PATH="$PATH${pathSuffix}";`);
  }

  let pythonPathSuffix = '';
  if (process.env['PYTHONPATH']) {
    const paths = process.env['PYTHONPATH'].split(pathSeparator);
    for (const p of paths) {
      const containerPath = getContainerPath(p);
      if (
        containerPath.toLowerCase().startsWith(containerWorkdir.toLowerCase())
      ) {
        pythonPathSuffix += `:${containerPath}`;
      }
    }
  }
  if (pythonPathSuffix) {
    shellCmds.push(`export PYTHONPATH="$PYTHONPATH${pythonPathSuffix}";`);
  }

  const projectSandboxBashrc = `${GEMINI_DIR}/sandbox.bashrc`;
  if (fs.existsSync(projectSandboxBashrc)) {
    shellCmds.push(`source ${getContainerPath(projectSandboxBashrc)};`);
  }

  ports().forEach((p) =>
    shellCmds.push(
      `socat TCP4-LISTEN:${p},bind=$(hostname -i),fork,reuseaddr TCP4:127.0.0.1:${p} 2> /dev/null &`,
    ),
  );

  const quotedCliArgs = cliArgs.slice(2).map((arg) => quote([arg]));
  const isDebugMode =
    process.env['DEBUG'] === 'true' || process.env['DEBUG'] === '1';
  const cliCmd =
    process.env['NODE_ENV'] === 'development'
      ? isDebugMode
        ? 'npm run debug --'
        : 'npm rebuild && npm run start --'
      : isDebugMode
        ? `node --inspect-brk=0.0.0.0:${process.env['DEBUG_PORT'] || '9229'} $(which gemini)`
        : 'gemini';

  const args = [...shellCmds, cliCmd, ...quotedCliArgs];
  return ['bash', '-c', args.join(' ')];
}
