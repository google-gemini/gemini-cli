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
      if (
        osReleaseContent.includes('ID=debian') ||
        osReleaseContent.includes('ID=ubuntu') ||
        osReleaseContent.match(/^ID_LIKE=.*debian.*/m) || // Covers derivatives
        osReleaseContent.match(/^ID_LIKE=.*ubuntu.*/m) // Covers derivatives
      ) {
        debugLogger.log(
          'Defaulting to use current user UID/GID for Debian/Ubuntu-based Linux.',
        );
        return true;
      }
    } catch (_err) {
      // Silently ignore if /etc/os-release is not found or unreadable.
      // The default (false) will be applied in this case.
      debugLogger.warn(
        'Warning: Could not read /etc/os-release to auto-detect Debian/Ubuntu for UID/GID default.',
      );
    }
  }
  return false; // Default to false if no other condition is met
}

/**
 * Splits a Docker image reference into its repository and tag parts.
 *
 * Uses `lastIndexOf(':')` to find the tag separator, but guards against
 * interpreting a port number as a tag by checking whether the substring
 * after the last colon contains a `/` (which would indicate it is part
 * of the registry path, not a tag).
 *
 * Examples:
 *   'ubuntu:latest'                  → ['ubuntu', 'latest']
 *   'localhost:5000/sandbox:latest'  → ['localhost:5000/sandbox', 'latest']
 *   'localhost:5000/sandbox'         → ['localhost:5000/sandbox', undefined]
 *   'ubuntu'                         → ['ubuntu', undefined]
 */
export function splitImageTag(
  image: string,
): [repo: string, tag: string | undefined] {
  const lastColon = image.lastIndexOf(':');
  if (lastColon === -1) {
    return [image, undefined];
  }

  const possibleTag = image.slice(lastColon + 1);

  // If the part after the last colon contains a '/', it's not a tag
  // (e.g. 'localhost:5000/sandbox' → port, not tag).
  if (possibleTag.includes('/')) {
    return [image, undefined];
  }

  return [image.slice(0, lastColon), possibleTag];
}

export function parseImageName(image: string): string {
  const [fullName, tag] = splitImageTag(image);
  const name = fullName.split('/').at(-1) ?? 'unknown-image';
  return tag ? `${name}-${tag}` : name;
}

function sanitizePort(value: string): string | undefined {
  const trimmedValue = value.trim();
  if (!/^\d{1,5}$/.test(trimmedValue)) {
    return undefined;
  }
  const port = Number(trimmedValue);
  return port >= 1 && port <= 65535 ? trimmedValue : undefined;
}

export function ports(): string[] {
  return (process.env['SANDBOX_PORTS'] ?? '')
    .split(',')
    .map((port) => sanitizePort(port))
    .filter((port): port is string => Boolean(port));
}

export function sanitizeDebugPort(value: string | undefined): string {
  if (!value) {
    return '9229';
  }

  const trimmedValue = value.trim();
  if (!/^\d{1,5}$/.test(trimmedValue)) {
    return '9229';
  }

  const port = Number(trimmedValue);
  return port >= 1 && port <= 65535 ? trimmedValue : '9229';
}

export function entrypoint(
  workdir: string,
  cliArgs: string[],
  isDirectCommand = false,
): string[] {
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

  const quotedCliArgs = (isDirectCommand ? cliArgs : cliArgs.slice(2)).map(
    (arg) => quote([arg]),
  );
  const isDebugMode =
    process.env['DEBUG'] === 'true' || process.env['DEBUG'] === '1';
  const cliCmd = isDirectCommand
    ? ''
    : process.env['NODE_ENV'] === 'development'
      ? isDebugMode
        ? 'npm run debug --'
        : 'npm rebuild && npm run start --'
      : isDebugMode
        ? `node --inspect-brk=0.0.0.0:${sanitizeDebugPort(process.env['DEBUG_PORT'])} $(which gemini)`
        : 'gemini';

  const args = [...shellCmds, cliCmd, ...quotedCliArgs].filter(Boolean);
  return ['bash', '-c', args.join(' ')];
}
