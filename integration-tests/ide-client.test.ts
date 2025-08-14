/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as net from 'node:net';
import { IdeClient } from '../packages/core/src/ide/ide-client.js';
import { getIdeProcessId } from '../packages/core/src/ide/process-utils.js';
import { spawn, ChildProcess } from 'child_process';

describe('IdeClient', () => {
  it('reads port from file and connects', async () => {
    const port = 12345;
    const pid = await getIdeProcessId();
    const portFile = path.join(os.tmpdir(), `gemini-ide-server-${pid}.json`);
    fs.writeFileSync(portFile, JSON.stringify({ port }));

    const ideClient = IdeClient.getInstance();
    await ideClient.connect();

    expect(ideClient.getConnectionStatus().status).not.toBe('disconnected');

    fs.unlinkSync(portFile);
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
  let server: net.Server;
  let envPort: number;
  let pid: number;
  let portFile: string;

  beforeEach(async () => {
    pid = await getIdeProcessId();
    portFile = path.join(os.tmpdir(), `gemini-ide-server-${pid}.json`);
    envPort = await getFreePort();
    server = net.createServer().listen(envPort);
    process.env['GEMINI_CLI_IDE_SERVER_PORT'] = String(envPort);
    process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = process.cwd();
    // Reset instance
    IdeClient.instance = undefined;
  });

  afterEach(() => {
    server.close();
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

    expect(ideClient.getConnectionStatus().status).toBe('connected');
  });

  it('falls back to env var when connection with port from file fails', async () => {
    const filePort = await getFreePort();
    // Write port file with a port that is not listening
    fs.writeFileSync(portFile, JSON.stringify({ port: filePort }));

    const ideClient = IdeClient.getInstance();
    await ideClient.connect();

    expect(ideClient.getConnectionStatus().status).toBe('connected');
  });
});

describe('getIdeProcessId', () => {
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
      child = spawn(
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
