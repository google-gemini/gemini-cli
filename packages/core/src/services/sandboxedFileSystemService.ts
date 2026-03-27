/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { type FileSystemService } from './fileSystemService.js';
import { type SandboxManager } from './sandboxManager.js';
import { debugLogger } from '../utils/debugLogger.js';
import { isNodeError } from '../utils/errors.js';

/**
 * A FileSystemService implementation that performs operations through a sandbox.
 */
export class SandboxedFileSystemService implements FileSystemService {
  constructor(
    private sandboxManager: SandboxManager,
    private cwd: string,
  ) {}

  async readTextFile(filePath: string): Promise<string> {
    const prepared = await this.sandboxManager.prepareCommand({
      command: '__read',
      args: [filePath],
      cwd: this.cwd,
      env: process.env,
    });

    return new Promise((resolve, reject) => {
      // Direct spawn is necessary here for streaming large file contents.

      const child = spawn(prepared.program, prepared.args, {
        cwd: this.cwd,
        env: prepared.env,
      });

      let output = '';
      let error = '';

      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.stderr?.on('data', (data) => {
        error += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(
            new Error(
              `Sandbox Error: read_file failed for '${filePath}'. Exit code ${code}. ${error ? 'Details: ' + error : ''}`,
            ),
          );
        }
      });

      child.on('error', (err) => {
        reject(
          new Error(
            `Sandbox Error: Failed to spawn read_file for '${filePath}': ${err.message}`,
          ),
        );
      });
    });
  }

  async writeTextFile(filePath: string, content: string): Promise<void> {
    const prepared = await this.sandboxManager.prepareCommand({
      command: '__write',
      args: [filePath],
      cwd: this.cwd,
      env: process.env,
    });

    return new Promise((resolve, reject) => {
      // Direct spawn is necessary here for streaming large file contents.

      const child = spawn(prepared.program, prepared.args, {
        cwd: this.cwd,
        env: prepared.env,
      });

      child.stdin?.on('error', (err) => {
        // Silently ignore EPIPE errors on stdin, they will be caught by the process error/close listeners
        if (isNodeError(err) && err.code === 'EPIPE') {
          return;
        }
        debugLogger.error(
          `Sandbox Error: stdin error for '${filePath}': ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });

      child.stdin?.write(content);
      child.stdin?.end();

      let error = '';
      child.stderr?.on('data', (data) => {
        error += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `Sandbox Error: write_file failed for '${filePath}'. Exit code ${code}. ${error ? 'Details: ' + error : ''}`,
            ),
          );
        }
      });

      child.on('error', (err) => {
        reject(
          new Error(
            `Sandbox Error: Failed to spawn write_file for '${filePath}': ${err.message}`,
          ),
        );
      });
    });
  }
}
