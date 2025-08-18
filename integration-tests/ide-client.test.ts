/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as net from 'node:net';
import * as child_process from 'node:child_process';
import { IdeClient } from '../packages/core/src/ide/ide-client.js';

import { TestMcpServer } from './test-mcp-server.js';

describe.skip('IdeClient', () => {
  it('reads port from file and connects', async () => {
    const server = new TestMcpServer();
    const port = await server.start();
    const pid = process.pid;
    const portFile = path.join(os.tmpdir(), `gemini-ide-server-${pid}.json`);
    fs.writeFileSync(portFile, JSON.stringify({ port }));
    process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = process.cwd();
    process.env['TERM_PROGRAM'] = 'vscode';

    const ideClient = IdeClient.getInstance();
    await ideClient.connect();

    expect(ideClient.getConnectionStatus()).toEqual({
      status: 'connected',
      details: undefined,
    });

    fs.unlinkSync(portFile);
    await server.stop();
    delete process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'];
    // Reset instance
    IdeClient.instance = undefined;
  });
});

const getFreePort = (): Promise<number> => {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => {
        resolve(port);
      });
    });
  });
};

describe('IdeClient fallback connection logic', () => {
  let server: TestMcpServer;
  let envPort: number;
  let pid: number;
  let portFile: string;

  beforeEach(async () => {
    pid = process.pid;
    portFile = path.join(os.tmpdir(), `gemini-ide-server-${pid}.json`);
    server = new TestMcpServer();
    envPort = await server.start();
    process.env['GEMINI_CLI_IDE_SERVER_PORT'] = String(envPort);
    process.env['TERM_PROGRAM'] = 'vscode';
    process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = process.cwd();
    // Reset instance
    IdeClient.instance = undefined;
  });

  afterEach(async () => {
    await server.stop();
    delete process.env['GEMINI_CLI_IDE_SERVER_PORT'];
    delete process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'];
    if (fs.existsSync(portFile)) {
      fs.unlinkSync(portFile);
    }
  });

  it('connects using env var when port file does not exist', async () => {
    // Ensure port file doesn't exist
    if (fs.existsSync(portFile)) {
      fs.unlinkSync(portFile);
    }

    const ideClient = IdeClient.getInstance();
    await ideClient.connect();

    expect(ideClient.getConnectionStatus()).toEqual({
      status: 'connected',
      details: undefined,
    });
  });

  it('falls back to env var when connection with port from file fails', async () => {
    const filePort = await getFreePort();
    // Write port file with a port that is not listening
    fs.writeFileSync(portFile, JSON.stringify({ port: filePort }));

    const ideClient = IdeClient.getInstance();
    await ideClient.connect();

    expect(ideClient.getConnectionStatus()).toEqual({
      status: 'connected',
      details: undefined,
    });
  });
});

describe.skip('getIdeProcessId', () => {
  let child: ChildProcess;

  afterEach(() => {
    if (child) {
      child.kill();
    }
  });

  it('should return the pid of the parent process', async () => {
    // We need to spawn a child process that will run the test
    // so that we can check that getIdeProcessId returns the pid of the parent
    const parentPid = process.pid;
    const output = await new Promise<string>((resolve, reject) => {
      child = child_process.spawn(
        'node',
        [
          '-e',
          `
        const { getIdeProcessId } = require('../packages/core/src/ide/process-utils.js');
        getIdeProcessId().then(pid => console.log(pid));
      `,
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      let out = '';
      child.stdout?.on('data', (data) => {
        out += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(out.trim());
        } else {
          reject(new Error(`Child process exited with code ${code}`));
        }
      });
    });

    expect(parseInt(output, 10)).toBe(parentPid);
  }, 10000);
});
