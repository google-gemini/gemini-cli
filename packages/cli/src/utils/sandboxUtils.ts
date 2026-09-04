/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { quote } from 'shell-quote';
import {
  debugLogger,
  GEMINI_DIR,
  homedir,
  resolveToRealPath,
} from '@google/gemini-cli-core';

export const LOCAL_DEV_SANDBOX_IMAGE_NAME = 'gemini-cli-sandbox';
export const SANDBOX_NETWORK_NAME = 'gemini-cli-sandbox';
export const SANDBOX_PROXY_NAME = 'gemini-cli-sandbox-proxy';
export const BUILTIN_SEATBELT_PROFILES = [
  'permissive-open',
  'permissive-closed',
  'permissive-proxied',
  'restrictive-open',
  'restrictive-closed',
  'restrictive-proxied',
  'strict-open',
  'strict-proxied',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Checks if a host path is sensitive and should be prohibited from mounting
 * into the sandbox container. This protects ~/.gemini, user home directories,
 * and sensitive credential files from being accessed or poisoned.
 */
export function isSensitiveHostPath(hostPath: string): boolean {
  try {
    let home = path.resolve(homedir());
    let osHome = path.resolve(os.homedir());
    try {
      home = resolveToRealPath(home);
    } catch {
      // Keep resolved path if resolveToRealPath fails
    }
    try {
      osHome = resolveToRealPath(osHome);
    } catch {
      // Keep resolved path if resolveToRealPath fails
    }

    let expandedPath = hostPath;
    if (hostPath === '~' || hostPath === '~/' || hostPath === '~\\') {
      expandedPath = home;
    } else if (hostPath.startsWith('~/') || hostPath.startsWith('~\\')) {
      expandedPath = path.join(home, hostPath.slice(2));
    }

    let resolvedPath = expandedPath;
    try {
      resolvedPath = resolveToRealPath(expandedPath);
    } catch {
      resolvedPath = path.resolve(expandedPath);
    }
    const normalized = resolvedPath;
    let geminiDir = path.resolve(home, GEMINI_DIR);
    let osGeminiDir = path.resolve(osHome, GEMINI_DIR);
    try {
      geminiDir = resolveToRealPath(geminiDir);
    } catch {
      // Keep resolved path if resolveToRealPath fails
    }
    try {
      osGeminiDir = resolveToRealPath(osGeminiDir);
    } catch {
      // Keep resolved path if resolveToRealPath fails
    }

    const isWindows = os.platform() === 'win32';
    const arePathsEqual = (p1: string, p2: string) =>
      isWindows ? p1.toLowerCase() === p2.toLowerCase() : p1 === p2;
    const isSubpathOf = (child: string, parent: string) =>
      isWindows
        ? child.toLowerCase().startsWith((parent + path.sep).toLowerCase())
        : child.startsWith(parent + path.sep);

    // Block mounting user home directory root directly
    if (arePathsEqual(normalized, home) || arePathsEqual(normalized, osHome)) {
      return true;
    }

    // Block mounting ~/.gemini or anything inside ~/.gemini
    if (
      arePathsEqual(normalized, geminiDir) ||
      isSubpathOf(normalized, geminiDir) ||
      arePathsEqual(normalized, osGeminiDir) ||
      isSubpathOf(normalized, osGeminiDir)
    ) {
      return true;
    }

    // Block sensitive secrets, credential stores, and environment files anywhere
    const baseName = path.basename(normalized).toLowerCase();
    if (
      baseName === '.env' ||
      baseName.startsWith('.env.') ||
      baseName === 'oauth_creds.json' ||
      baseName === 'gemini-credentials.json' ||
      baseName === 'mcp-oauth-tokens.json' ||
      baseName === 'a2a-oauth-tokens.json' ||
      baseName === 'google_accounts.json' ||
      baseName === 'trusted_hooks.json'
    ) {
      return true;
    }
  } catch {
    return true; // Fail closed if path resolution fails
  }

  return false;
}

/**
 * Sanitizes user settings for the sandbox by stripping unvalidated hooks,
 * command hooks, API keys, and sensitive tokens.
 */
export function sanitizeSettingsForSandbox(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = structuredClone(settings);

  // Remove hooks to prevent configuration poisoning and unvalidated hook execution
  delete sanitized['hooks'];

  // Remove command execution hooks in tools if present
  const tools = sanitized['tools'];
  if (isRecord(tools)) {
    const safeTools = { ...tools };
    delete safeTools['discoveryCommand'];
    delete safeTools['callCommand'];
    sanitized['tools'] = safeTools;
  }

  // Remove sensitive keys and credentials
  delete sanitized['apiKey'];
  delete sanitized['geminiApiKey'];
  delete sanitized['googleApiKey'];

  return sanitized;
}

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
