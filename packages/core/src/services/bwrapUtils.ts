/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Paths that may or may not exist depending on distro (symlinks, etc.) */
export const BWRAP_OPTIONAL_LIB_PATHS = ['/lib', '/lib64', '/etc/alternatives'];

/** Minimal /etc files needed for most tools to function. */
export const BWRAP_ESSENTIAL_ETC_FILES = [
  '/etc/passwd',
  '/etc/group',
  '/etc/hosts',
  '/etc/nsswitch.conf',
];

/**
 * Builds the base bwrap namespace and filesystem args shared by both
 * the outer (CLI-level) and inner (tool-level) sandboxes.
 */
export function buildBaseBwrapArgs(hostname: string): string[] {
  return [
    '--new-session',
    '--die-with-parent',
    '--unshare-pid',
    '--unshare-user',
    '--unshare-ipc',
    '--unshare-uts',
    '--unshare-cgroup',
    '--hostname',
    hostname,
    '--proc',
    '/proc',
    '--dev',
    '/dev',
    '--tmpfs',
    '/dev/shm',
    '--ro-bind',
    '/usr',
    '/usr',
    '--ro-bind',
    '/bin',
    '/bin',
    '--ro-bind',
    '/sbin',
    '/sbin',
  ];
}

/**
 * Appends ro-bind or bind args for each path that exists on the filesystem.
 */
export function bindExistingPaths(
  args: string[],
  paths: readonly string[],
  mode: '--ro-bind' | '--bind' = '--ro-bind',
): void {
  for (const p of paths) {
    if (fs.existsSync(p)) {
      args.push(mode, p, p);
    }
  }
}

/**
 * Binds the current node binary (and its containing directory) read-only.
 * This is needed for nvm/asdf users whose node lives under $HOME.
 */
export function bindNodeBinary(args: string[], homeDir: string): void {
  const nodePath = process.execPath;
  if (nodePath.startsWith(homeDir)) {
    args.push('--ro-bind', nodePath, nodePath);
    const nodeDir = path.dirname(nodePath);
    args.push('--ro-bind', nodeDir, nodeDir);
  }
}
