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
    const err = error as { code?: number; stdout?: string; stderr?: string };
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
      it('executes commands within the workspace', async () => {
        const manager = new MacOsSandboxManager({ workspace: process.cwd() });
        const command = await manager.prepareCommand({
          command: 'echo',
          args: ['sandbox test'],
          cwd: process.cwd(),
          env: process.env,
        });

        const result = await runCommand(command);
        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe('sandbox test');
      });

      it('supports interactive pseudo-terminals (node-pty)', async () => {
        const manager = new MacOsSandboxManager({ workspace: process.cwd() });
        const handle = await ShellExecutionService.execute(
          'bash -c "if [ -t 1 ]; then echo True; else echo False; fi"',
          process.cwd(),
          () => {},
          new AbortController().signal,
          true,
          {
            sanitizationConfig: getSecureSanitizationConfig(),
            sandboxManager: manager,
          },
        );

        const result = await handle.result;
        expect(result.exitCode).toBe(0);
        expect(result.output).toContain('True');
      });
    });

    describe('File System Access', () => {
      it('blocks access outside the workspace', async () => {
        const manager = new MacOsSandboxManager({ workspace: process.cwd() });
        const command = await manager.prepareCommand({
          command: 'touch',
          args: ['/Users/Shared/.gemini_test_blocked'],
          cwd: process.cwd(),
          env: process.env,
        });
        const result = await runCommand(command);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('Operation not permitted');
      });

      it('grants access to explicitly allowed paths', async () => {
        const allowedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'allowed-'));
        try {
          const manager = new MacOsSandboxManager({ workspace: process.cwd() });
          const command = await manager.prepareCommand({
            command: 'touch',
            args: [path.join(allowedDir, 'test.txt')],
            cwd: process.cwd(),
            env: process.env,
            policy: { allowedPaths: [allowedDir] },
          });
          const result = await runCommand(command);
          expect(result.status).toBe(0);
        } finally {
          fs.rmSync(allowedDir, { recursive: true, force: true });
        }
      });

      it('blocks access to forbidden paths within the workspace', async () => {
        const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-'));
        const forbiddenDir = path.join(workspace, 'forbidden');
        fs.mkdirSync(forbiddenDir);

        try {
          const manager = new MacOsSandboxManager({ workspace });
          const command = await manager.prepareCommand({
            command: 'touch',
            args: [path.join(forbiddenDir, 'test.txt')],
            cwd: workspace,
            env: process.env,
            policy: { forbiddenPaths: [forbiddenDir] },
          });
          const result = await runCommand(command);
          expect(result.status).not.toBe(0);
          expect(result.stderr).toContain('Operation not permitted');
        } finally {
          fs.rmSync(workspace, { recursive: true, force: true });
        }
      });

      it('prioritizes forbiddenPaths over allowedPaths', async () => {
        const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-'));
        const conflictDir = path.join(workspace, 'conflict');
        fs.mkdirSync(conflictDir);

        try {
          const manager = new MacOsSandboxManager({ workspace });
          const command = await manager.prepareCommand({
            command: 'touch',
            args: [path.join(conflictDir, 'test.txt')],
            cwd: workspace,
            env: process.env,
            policy: {
              allowedPaths: [conflictDir],
              forbiddenPaths: [conflictDir],
            },
          });
          const result = await runCommand(command);
          expect(result.status).not.toBe(0);
          expect(result.stderr).toContain('Operation not permitted');
        } finally {
          fs.rmSync(workspace, { recursive: true, force: true });
        }
      });
    });

    describe('Network Access', () => {
      let server: http.Server;
      let url: string;

      beforeAll(async () => {
        server = http.createServer((_, res) => {
          res.setHeader('Connection', 'close');
          res.writeHead(200);
          res.end('ok');
        });
        await new Promise<void>((resolve, reject) => {
          server.on('error', reject);
          server.listen(0, '127.0.0.1', () => {
            const addr = server.address() as import('net').AddressInfo;
            url = `http://127.0.0.1:${addr.port}`;
            resolve();
          });
        });
      });

      afterAll(async () => {
        if (server) await new Promise<void>((res) => server.close(() => res()));
      });

      it('blocks network access by default', async () => {
        const manager = new MacOsSandboxManager({ workspace: process.cwd() });
        const command = await manager.prepareCommand({
          command: 'curl',
          args: ['-s', '--connect-timeout', '1', url],
          cwd: process.cwd(),
          env: process.env,
        });
        const result = await runCommand(command);
        expect(result.status).not.toBe(0);
      });

      it('grants network access when explicitly allowed', async () => {
        const manager = new MacOsSandboxManager({ workspace: process.cwd() });
        const command = await manager.prepareCommand({
          command: 'curl',
          args: ['-s', '--connect-timeout', '1', url],
          cwd: process.cwd(),
          env: process.env,
          policy: { networkAccess: true },
        });
        const result = await runCommand(command);
        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe('ok');
      });
    });
  },
);
