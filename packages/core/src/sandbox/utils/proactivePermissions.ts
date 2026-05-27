/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { type SandboxPermissions } from '../../services/sandboxManager.js';
import { normalizeCommand } from '../../utils/shell-utils.js';

const NETWORK_RELIANT_TOOLS = new Set([
  'npm',
  'npx',
  'yarn',
  'pnpm',
  'bun',
  'git',
  'ssh',
  'scp',
  'sftp',
  'curl',
  'wget',
]);

const NODE_ECOSYSTEM_TOOLS = new Set(['npm', 'npx', 'yarn', 'pnpm', 'bun']);

const NETWORK_HEAVY_SUBCOMMANDS = new Set([
  'install',
  'i',
  'ci',
  'update',
  'up',
  'publish',
  'add',
  'remove',
  'outdated',
  'audit',
]);

/**
 * Returns true if the command or subcommand is known to be network-reliant.
 */
export function isNetworkReliantCommand(
  commandName: string,
  subCommand?: string,
): boolean {
  const normalizedCommand = normalizeCommand(commandName);
  if (!NETWORK_RELIANT_TOOLS.has(normalizedCommand)) {
    return false;
  }

  // Node ecosystem tools only need network for specific subcommands
  if (NODE_ECOSYSTEM_TOOLS.has(normalizedCommand)) {
    // Bare yarn/bun/pnpm is an alias for install
    if (
      !subCommand &&
      (normalizedCommand === 'yarn' ||
        normalizedCommand === 'bun' ||
        normalizedCommand === 'pnpm')
    ) {
      return true;
    }

    return (
      !!subCommand && NETWORK_HEAVY_SUBCOMMANDS.has(subCommand.toLowerCase())
    );
  }

  // Other tools (ssh, git, curl, etc.) are always network-reliant
  return true;
}

/**
 * Returns suggested additional permissions for network-reliant tools
 * based on common configuration and cache directories.
 */
/**
 * Returns suggested additional permissions for network-reliant tools
 * based on common configuration and cache directories.
 */
export async function getProactiveToolSuggestions(
  commandName: string,
): Promise<SandboxPermissions | undefined> {
  const normalizedCommand = normalizeCommand(commandName);
  if (!NETWORK_RELIANT_TOOLS.has(normalizedCommand)) {
    return undefined;
  }

  const home = os.homedir();
  const readOnlyPaths: string[] = [];
  const primaryCachePaths: string[] = [];
  const optionalCachePaths: string[] = [];

  if (normalizedCommand === 'npm' || normalizedCommand === 'npx') {
    readOnlyPaths.push(path.join(home, '.npmrc'));
    primaryCachePaths.push(path.join(home, '.npm'));
    optionalCachePaths.push(path.join(home, '.node-gyp'));
    optionalCachePaths.push(path.join(home, '.cache'));
  } else if (normalizedCommand === 'yarn') {
    readOnlyPaths.push(path.join(home, '.yarnrc'));
    readOnlyPaths.push(path.join(home, '.yarnrc.yml'));
    primaryCachePaths.push(path.join(home, '.yarn'));
    primaryCachePaths.push(path.join(home, '.config', 'yarn'));
    optionalCachePaths.push(path.join(home, '.cache'));
  } else if (normalizedCommand === 'pnpm') {
    readOnlyPaths.push(path.join(home, '.npmrc'));
    primaryCachePaths.push(path.join(home, '.pnpm-store'));
    primaryCachePaths.push(path.join(home, '.config', 'pnpm'));
    optionalCachePaths.push(path.join(home, '.cache'));
  } else if (normalizedCommand === 'bun') {
    readOnlyPaths.push(path.join(home, '.bunfig.toml'));
    primaryCachePaths.push(path.join(home, '.bun'));
    optionalCachePaths.push(path.join(home, '.cache'));
  } else if (normalizedCommand === 'git') {
    readOnlyPaths.push(path.join(home, '.ssh'));
    readOnlyPaths.push(path.join(home, '.gitconfig'));
    optionalCachePaths.push(path.join(home, '.cache'));
  } else if (
    normalizedCommand === 'ssh' ||
    normalizedCommand === 'scp' ||
    normalizedCommand === 'sftp'
  ) {
    readOnlyPaths.push(path.join(home, '.ssh'));
  }

  // Windows specific paths
  if (os.platform() === 'win32') {
    const appData = process.env['AppData'];
    const localAppData = process.env['LocalAppData'];
    if (normalizedCommand === 'npm' || normalizedCommand === 'npx') {
      if (appData) {
        primaryCachePaths.push(path.join(appData, 'npm'));
        optionalCachePaths.push(path.join(appData, 'npm-cache'));
      }
      if (localAppData) {
        optionalCachePaths.push(path.join(localAppData, 'npm-cache'));
      }
    }
  }

  const finalReadOnly: string[] = [];
  const finalReadWrite: string[] = [];

  const checkExists = async (p: string): Promise<boolean> => {
    try {
      await fs.promises.access(p, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  };

  const readOnlyChecks = await Promise.all(
    readOnlyPaths.map(async (p) => ({ path: p, exists: await checkExists(p) })),
  );
  for (const { path: p, exists } of readOnlyChecks) {
    if (exists) {
      finalReadOnly.push(p);
    }
  }

  for (const p of primaryCachePaths) {
    finalReadWrite.push(p);
  }

  const optionalChecks = await Promise.all(
    optionalCachePaths.map(async (p) => ({
      path: p,
      exists: await checkExists(p),
    })),
  );
  for (const { path: p, exists } of optionalChecks) {
    if (exists) {
      finalReadWrite.push(p);
    }
  }

  return {
    fileSystem:
      finalReadOnly.length > 0 || finalReadWrite.length > 0
        ? {
            read: [...finalReadOnly, ...finalReadWrite],
            write: finalReadWrite,
          }
        : undefined,
    network: true,
  };
}
