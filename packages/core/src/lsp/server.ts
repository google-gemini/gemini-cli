/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LSP Server Definitions
 *
 * Defines how to spawn and configure LSP servers for different languages.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Handle to a spawned LSP server process
 */
export interface ServerHandle {
  /** The spawned child process */
  process: ChildProcess;
  /** Optional initialization options to send to the server */
  initialization?: Record<string, unknown>;
}

/**
 * Definition for an LSP server
 */
export interface ServerInfo {
  /** Unique identifier for this server */
  id: string;
  /** File extensions this server handles (with leading dot) */
  extensions: string[];
  /** Spawn the server process for a given root directory */
  spawn(root: string): Promise<ServerHandle | undefined>;
  /** Find the project root directory for a given file path */
  findRoot(filePath: string): Promise<string | undefined>;
}

/**
 * Find the nearest file matching one of the given names, walking up from the start path.
 *
 * @param startPath - The file or directory path to start from
 * @param fileNames - Array of file names to search for
 * @returns The directory containing the found file, or undefined if not found
 */
async function findNearestFile(
  startPath: string,
  fileNames: string[],
): Promise<string | undefined> {
  let currentDir = path.dirname(startPath);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    for (const fileName of fileNames) {
      const filePath = path.join(currentDir, fileName);
      try {
        await fs.access(filePath);
        return currentDir;
      } catch {
        // File doesn't exist, continue searching
      }
    }
    currentDir = path.dirname(currentDir);
  }

  return undefined;
}

/**
 * Find an executable in the system PATH.
 *
 * @param name - The name of the executable to find
 * @returns The full path to the executable, or undefined if not found
 */
async function findExecutable(name: string): Promise<string | undefined> {
  const pathEnv = process.env['PATH'] || '';
  const pathSeparator = process.platform === 'win32' ? ';' : ':';
  const extensions =
    process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];

  for (const dir of pathEnv.split(pathSeparator)) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, name + ext);
      try {
        await fs.access(fullPath, fs.constants.X_OK);
        return fullPath;
      } catch {
        // Not found or not executable, continue searching
      }
    }
  }

  return undefined;
}

/**
 * TypeScript/JavaScript Language Server
 *
 * Uses npx to run typescript-language-server, which will:
 * 1. Use the local project's version if installed in node_modules
 * 2. Fall back to a cached version otherwise
 */
export const TypeScriptServer: ServerInfo = {
  id: 'typescript',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'],

  async spawn(root: string): Promise<ServerHandle | undefined> {
    // Check if npx is available
    const npx = await findExecutable('npx');
    if (!npx) {
      return undefined;
    }

    const childProcess = spawn(npx, ['typescript-language-server', '--stdio'], {
      cwd: root,
      env: {
        ...process.env,
        // Disable Node.js options that might interfere with the server
        NODE_OPTIONS: '',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Handle spawn errors
    childProcess.on('error', (err) => {
      debugLogger.debug(
        `Failed to spawn typescript-language-server via npx: ${err.message}`,
      );
    });

    return { process: childProcess };
  },

  async findRoot(filePath: string): Promise<string | undefined> {
    // Look for common TypeScript/JavaScript project markers
    return findNearestFile(filePath, [
      'package.json',
      'tsconfig.json',
      'jsconfig.json',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'bun.lockb',
    ]);
  },
};

/**
 * All available LSP server definitions.
 * Add more servers here as support is expanded.
 */
export const ALL_SERVERS: ServerInfo[] = [TypeScriptServer];

/**
 * Get a server by its ID.
 *
 * @param id - The server ID to look up
 * @returns The server info, or undefined if not found
 */
export function getServerById(id: string): ServerInfo | undefined {
  return ALL_SERVERS.find((server) => server.id === id);
}

/**
 * Get all servers that support a given file extension.
 *
 * @param extension - The file extension (with leading dot)
 * @returns Array of servers that support this extension
 */
export function getServersForExtension(extension: string): ServerInfo[] {
  return ALL_SERVERS.filter((server) => server.extensions.includes(extension));
}
