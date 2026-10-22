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
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Known sensitive or credential file names that must not be mounted into the sandbox container.
 */
export const SENSITIVE_SETTINGS_FILENAMES = new Set([
  'oauth_creds.json',
  'google_accounts.json',
  'gemini-credentials.json',
  'mcp-oauth-tokens.json',
  'a2a-oauth-tokens.json',
  'trusted_hooks.json',
  'trustedfolders.json',
  'trustedFolders.json',
  'policy_integrity.json',
]);

/**
 * Returns true if the given file or directory path corresponds to credentials or sensitive data
 * that must not be mounted into the untrusted sandbox container.
 */
export function isCredentialOrSensitivePath(
  targetPath: string,
  rootDir?: string,
): boolean {
  if (rootDir && path.resolve(targetPath) === path.resolve(rootDir)) {
    return false;
  }
  const base = path.basename(targetPath).toLowerCase();
  if (SENSITIVE_SETTINGS_FILENAMES.has(base)) {
    return true;
  }
  const isRootChild = rootDir
    ? path.dirname(path.resolve(targetPath)) === path.resolve(rootDir)
    : true;
  if (isRootChild && (base === 'history' || base === 'tmp' || base === 'bin')) {
    return true;
  }
  const hasSensitiveSuffix = (s: string) => {
    if (base === s) return true;
    if (base.endsWith(s)) {
      const charBefore = base.charAt(base.length - s.length - 1);
      return charBefore === '-' || charBefore === '_' || charBefore === '.';
    }
    return false;
  };

  if (
    base.endsWith('.credentials') ||
    hasSensitiveSuffix('credentials') ||
    hasSensitiveSuffix('credentials.json') ||
    hasSensitiveSuffix('tokens.json') ||
    hasSensitiveSuffix('token.json') ||
    hasSensitiveSuffix('token') ||
    hasSensitiveSuffix('creds.json') ||
    hasSensitiveSuffix('cred.json') ||
    base.endsWith('.env') ||
    base.endsWith('.key') ||
    base.endsWith('.pem') ||
    base.endsWith('.p12') ||
    hasSensitiveSuffix('key.json')
  ) {
    return true;
  }
  return false;
}

/**
 * Resolves a path to its real path, falling back to path.resolve if it does not exist (ENOENT).
 * Rethrows unrecoverable errors so callers can fail closed.
 */
function safeResolveToRealPath(targetPath: string): string {
  let current = path.resolve(targetPath);
  const parts: string[] = [];
  const visited = new Set<string>();

  while (current && current !== path.dirname(current)) {
    const visitKey =
      os.platform() === 'win32' ? current.toLowerCase() : current;
    if (visited.has(visitKey)) {
      throw new Error('Circular symlink detected');
    }
    visited.add(visitKey);

    try {
      const real = resolveToRealPath(current);
      return path.resolve(real, ...parts.slice().reverse());
    } catch (err: unknown) {
      if (isRecord(err) && err['code'] === 'ENOENT') {
        try {
          const stat = fs.lstatSync(current);
          if (stat?.isSymbolicLink?.()) {
            const target = fs.readlinkSync(current);
            current = path.resolve(path.dirname(current), target);
            continue;
          }
        } catch (lstatErr: unknown) {
          if (!isRecord(lstatErr) || lstatErr['code'] !== 'ENOENT') {
            throw lstatErr;
          }
        }
        parts.push(path.basename(current));
        current = path.dirname(current);
        continue;
      }
      throw err;
    }
  }
  return path.resolve(targetPath);
}

/**
 * Checks if a host path is sensitive and should be prohibited from mounting
 * into the sandbox container. This protects ~/.gemini, user home directories,
 * and sensitive credential files from being accessed or poisoned.
 */
export function isSensitiveHostPath(hostPath: string): boolean {
  try {
    const rawHome = homedir();
    if (!rawHome || rawHome.trim() === '') {
      // If home directory cannot be determined, do not resolve it to process.cwd().
      // Only block user-tilde notations and sensitive files.
      if (
        hostPath === '~' ||
        hostPath === '~/' ||
        hostPath === '~\\' ||
        hostPath === '~/.gemini' ||
        hostPath.startsWith('~/.gemini/') ||
        hostPath === '~\\.gemini' ||
        hostPath.startsWith('~\\.gemini\\')
      ) {
        return true;
      }

      const resolvedPath = safeResolveToRealPath(hostPath);

      const baseName = path.basename(resolvedPath).toLowerCase();
      if (
        baseName === '.env' ||
        baseName.startsWith('.env.') ||
        SENSITIVE_SETTINGS_FILENAMES.has(baseName)
      ) {
        return true;
      }
      return false;
    }

    const home = safeResolveToRealPath(rawHome);

    let expandedPath = hostPath;
    if (hostPath === '~' || hostPath === '~/' || hostPath === '~\\') {
      expandedPath = home;
    } else if (hostPath.startsWith('~/') || hostPath.startsWith('~\\')) {
      expandedPath = path.join(home, hostPath.slice(2));
    }

    const normalized = safeResolveToRealPath(expandedPath);

    const geminiDirCandidate = path.join(home, GEMINI_DIR);
    const geminiDirOnHost = safeResolveToRealPath(geminiDirCandidate);

    const isWindows = os.platform() === 'win32';
    const arePathsEqual = (p1: string, p2: string) =>
      isWindows
        ? path.resolve(p1).toLowerCase() === path.resolve(p2).toLowerCase()
        : path.resolve(p1) === path.resolve(p2);
    const isSubpathOf = (child: string, parent: string) => {
      const resolvedChild = path.resolve(child);
      const resolvedParent = path.resolve(parent);
      const parentWithSep = resolvedParent.endsWith(path.sep)
        ? resolvedParent
        : resolvedParent + path.sep;
      return isWindows
        ? resolvedChild.toLowerCase().startsWith(parentWithSep.toLowerCase())
        : resolvedChild.startsWith(parentWithSep);
    };

    // Block mounting user home directory root directly or any of its parent directories (e.g. /home, /)
    if (arePathsEqual(normalized, home) || isSubpathOf(home, normalized)) {
      return true;
    }

    // Block mounting ~/.gemini, anything inside ~/.gemini, or any of its parent directories
    if (
      arePathsEqual(normalized, geminiDirOnHost) ||
      isSubpathOf(normalized, geminiDirOnHost) ||
      isSubpathOf(geminiDirOnHost, normalized)
    ) {
      return true;
    }

    // Block sensitive secrets, credential stores, and environment files anywhere
    const baseName = path.basename(normalized).toLowerCase();
    if (
      baseName === '.env' ||
      baseName.startsWith('.env.') ||
      SENSITIVE_SETTINGS_FILENAMES.has(baseName)
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

/**
 * Creates an isolated settings directory in a temporary location, populated with non-sensitive
 * configuration files from the user settings directory while excluding credential and auth files.
 */
export function prepareIsolatedSettingsDir(
  userSettingsDirOnHost: string,
): string {
  const baseTmpDir = os.tmpdir() || '/tmp';
  const isolatedDir = fs.mkdtempSync(
    path.join(baseTmpDir, 'gemini-sandbox-settings-'),
  );
  fs.chmodSync(isolatedDir, 0o700);

  if (fs.existsSync(userSettingsDirOnHost)) {
    try {
      fs.cpSync(userSettingsDirOnHost, isolatedDir, {
        recursive: true,
        filter: (source) =>
          !isCredentialOrSensitivePath(source, userSettingsDirOnHost),
      });
    } catch (err) {
      debugLogger.warn(
        `Failed to copy user settings to sandbox directory: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return isolatedDir;
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
