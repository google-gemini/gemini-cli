/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MacOsSandboxManager } from './MacOsSandboxManager.js';
import { ShellExecutionService } from '../../services/shellExecutionService.js';
import { getSecureSanitizationConfig } from '../../services/environmentSanitization.js';
import { type SandboxedCommand } from '../../services/sandboxManager.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

/**
 * A simple asynchronous wrapper for execFile that returns the exit status,
 * stdout, and stderr. Unlike spawnSync, this does not block the Node.js
 * event loop, allowing the local HTTP test server to function.
 */
async function runCommand(command: SandboxedCommand) {
  try {
    const { stdout, stderr } = await promisify(execFile)(
      command.program,
      command.args,
      {
        cwd: command.cwd,
        env: command.env,
        encoding: 'utf-8',
      },
    );
    return { status: 0, stdout, stderr };
  } catch (error: unknown) {
    const err = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      status: err.code ?? 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    };
  }
}

describe.skipIf(os.platform() !== 'darwin')(
  'MacOsSandboxManager Integration',
  () => {
    describe('Basic Execution', () => {
      it('should execute commands within the workspace', async () => {
        const manager = new MacOsSandboxManager({ workspace: process.cwd() });
        const command = await manager.prepareCommand({
          command: 'echo',
          args: ['sandbox test'],
          cwd: process.cwd(),
          env: process.env,
        });

        const execResult = await runCommand(command);

        expect(execResult.status).toBe(0);
        expect(execResult.stdout.trim()).toBe('sandbox test');
      });

      it('should support interactive pseudo-terminals (node-pty)', async () => {
        const manager = new MacOsSandboxManager({ workspace: process.cwd() });
        const abortController = new AbortController();

        // Verify that node-pty file descriptors are successfully allocated inside the sandbox
        // by using the bash [ -t 1 ] idiom to check if stdout is a TTY.
        const handle = await ShellExecutionService.execute(
          'bash -c "if [ -t 1 ]; then echo True; else echo False; fi"',
          process.cwd(),
          () => {},
          abortController.signal,
          true,
          {
            sanitizationConfig: getSecureSanitizationConfig(),
            sandboxManager: manager,
          },
        );

        const result = await handle.result;
        expect(result.error).toBeNull();
        expect(result.exitCode).toBe(0);
        expect(result.output).toContain('True');
      });
    });

    describe('File System Access', () => {
      it('should block file system access outside the workspace', async () => {
        const manager = new MacOsSandboxManager({ workspace: process.cwd() });
        const blockedPath = '/Users/Shared/.gemini_test_sandbox_blocked';

        const command = await manager.prepareCommand({
          command: 'touch',
          args: [blockedPath],
          cwd: process.cwd(),
          env: process.env,
        });
        const execResult = await runCommand(command);

        expect(execResult.status).not.toBe(0);
        expect(execResult.stderr).toContain('Operation not permitted');
      });

      it('should grant file system access to explicitly allowed paths', async () => {
        // Create a unique temporary directory to prevent artifacts and test flakiness
        const allowedDir = fs.mkdtempSync(
          path.join(os.tmpdir(), 'gemini-sandbox-test-'),
        );

        try {
          const manager = new MacOsSandboxManager({
            workspace: process.cwd(),
          });
          const testFile = path.join(allowedDir, 'test.txt');

          const command = await manager.prepareCommand({
            command: 'touch',
            args: [testFile],
            cwd: process.cwd(),
            env: process.env,
            policy: {
              allowedPaths: [allowedDir],
            },
          });

          const execResult = await runCommand(command);

          expect(execResult.status).toBe(0);
        } finally {
          fs.rmSync(allowedDir, { recursive: true, force: true });
        }
      });
    });

    describe('Network Access', () => {
      let testServer: http.Server;
      let testServerUrl: string;

      beforeAll(async () => {
        testServer = http.createServer((_, res) => {
          // Ensure connections are closed immediately to prevent hanging
          res.setHeader('Connection', 'close');
          res.writeHead(200);
          res.end('ok');
        });

        await new Promise<void>((resolve, reject) => {
          testServer.on('error', reject);
          testServer.listen(0, '127.0.0.1', () => {
            const address = testServer.address() as import('net').AddressInfo;
            testServerUrl = `http://127.0.0.1:${address.port}`;
            resolve();
          });
        });
      });

      afterAll(async () => {
        if (testServer) {
          await new Promise<void>((resolve) => {
            testServer.close(() => resolve());
          });
        }
      });

      it('should block network access by default', async () => {
        const manager = new MacOsSandboxManager({ workspace: process.cwd() });
        const command = await manager.prepareCommand({
          command: 'curl',
          args: ['-s', '--connect-timeout', '1', testServerUrl],
          cwd: process.cwd(),
          env: process.env,
        });

        const execResult = await runCommand(command);

        expect(execResult.status).not.toBe(0);
      });

      it('should grant network access when explicitly allowed', async () => {
        const manager = new MacOsSandboxManager({
          workspace: process.cwd(),
        });
        const command = await manager.prepareCommand({
          command: 'curl',
          args: ['-s', '--connect-timeout', '1', testServerUrl],
          cwd: process.cwd(),
          env: process.env,
          policy: {
            networkAccess: true,
          },
        });

        const execResult = await runCommand(command);

        expect(execResult.status).toBe(0);
        expect(execResult.stdout.trim()).toBe('ok');
      });
    });
  },
);
