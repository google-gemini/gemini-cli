/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { getIdeProcessInfo } from './process-utils.js';
import { IdeClient, IDEConnectionStatus } from './ide-client.js';
import { IDE_DEFINITIONS } from './detect-ide.js';
import { CloseDiffRequestSchema, OpenDiffRequestSchema } from './types.js';
import { debugLogger } from '../utils/debugLogger.js';

const platformOverride = vi.hoisted(() => ({
  value: undefined as NodeJS.Platform | undefined,
  tmpDir: undefined as string | undefined,
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  const platform = () => platformOverride.value ?? actual.platform();
  const tmpdir = () => platformOverride.tmpDir ?? actual.tmpdir();
  return {
    ...actual,
    platform,
    tmpdir,
    default: {
      ...actual,
      platform,
      tmpdir,
    },
  };
});

async function startCompanionStandIn(authToken: string) {
  const transports = new Map<string, StreamableHTTPServerTransport>();
  let port = 0;

  const server = http.createServer(async (req, res) => {
    const host = req.headers.host ?? '';
    if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(host)) {
      res.writeHead(403).end(JSON.stringify({ error: 'Invalid Host header' }));
      return;
    }
    const authHeader = req.headers.authorization;
    const [scheme, token] = (authHeader ?? '').split(' ');
    if (scheme !== 'Bearer' || token !== authToken) {
      res.writeHead(401).end('Unauthorized');
      return;
    }

    let raw = '';
    if (req.method === 'POST') {
      req.setEncoding('utf8');
      for await (const chunk of req) {
        raw += chunk;
      }
    }
    const body: unknown = raw ? JSON.parse(raw) : undefined;
    const sessionId = req.headers['mcp-session-id'];
    let transport =
      typeof sessionId === 'string' ? transports.get(sessionId) : undefined;
    if (!transport) {
      if (!isInitializeRequest(body)) {
        res.writeHead(400).end('Bad Request');
        return;
      }
      const created = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, created);
        },
      });
      transport = created;
      const mcp = new McpServer(
        { name: 'gemini-cli-companion-mcp-server', version: '1.0.0' },
        { capabilities: { logging: {} } },
      );
      mcp.registerTool(
        'openDiff',
        { description: 'stand-in', inputSchema: OpenDiffRequestSchema.shape },
        async () => ({ content: [] }),
      );
      mcp.registerTool(
        'closeDiff',
        { description: 'stand-in', inputSchema: CloseDiffRequestSchema.shape },
        async () => ({ content: [{ type: 'text', text: '{}' }] }),
      );
      await mcp.connect(transport);
    }
    await transport.handleRequest(req, res, body);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;

  return {
    port,
    close: async () => {
      await Promise.allSettled([...transports.values()].map((t) => t.close()));
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function writeCrossPlatformExecutable(
  dir: string,
  name: string,
  jsBody: string,
) {
  const jsPath = path.join(dir, `${name}-script.cjs`);
  fs.writeFileSync(jsPath, jsBody, 'utf8');

  const unixWrapper = path.join(dir, name);
  fs.writeFileSync(
    unixWrapper,
    `#!/usr/bin/env node\nrequire(${JSON.stringify(jsPath)});\n`,
    { mode: 0o755 },
  );

  const winCmdWrapper = path.join(dir, `${name}.cmd`);
  fs.writeFileSync(
    winCmdWrapper,
    `@echo off\r\n"${process.execPath}" "${jsPath}" %*\r\n`,
    'utf8',
  );
}

async function freshIdeClient(): Promise<IdeClient> {
  (
    IdeClient as unknown as { instancePromise: Promise<IdeClient> | null }
  ).instancePromise = null;
  return IdeClient.getInstance();
}

describe('process-utils and IDE detection integration', () => {
  afterEach(() => {
    platformOverride.value = undefined;
    platformOverride.tmpDir = undefined;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('resolves real process info on the current host OS without mocks', async () => {
    vi.stubEnv('GEMINI_CLI_IDE_PID', '');
    const info = await getIdeProcessInfo();
    expect(info.pid).toBeGreaterThan(0);
    expect(typeof info.command).toBe('string');
    expect(info.command.length).toBeGreaterThan(0);
  });

  describe('simulated Windows (win32) real child_process.exec fallback integration', () => {
    let tempRoot: string;
    let fakeBinDir: string;
    let fakeTmpDir: string;
    let callsLogPath: string;
    let companion:
      | Awaited<ReturnType<typeof startCompanionStandIn>>
      | undefined;
    let client: IdeClient | undefined;

    beforeEach(() => {
      vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});
      tempRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), 'process-utils-win-int-'),
      );
      fakeBinDir = path.join(tempRoot, 'bin');
      fakeTmpDir = path.join(tempRoot, 'tmp');
      fs.mkdirSync(fakeBinDir, { recursive: true });
      fs.mkdirSync(fakeTmpDir, { recursive: true });
      callsLogPath = path.join(tempRoot, 'exec-calls.jsonl');

      // Simulate Windows where `ps` does not exist and fails if invoked.
      writeCrossPlatformExecutable(
        fakeBinDir,
        'ps',
        `
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(callsLogPath)}, JSON.stringify({ bin: 'ps', args: process.argv.slice(2) }) + '\\n');
process.stderr.write("'ps' is not recognized as an internal or external command.\\n");
process.exit(1);
`,
      );

      // Simulate Windows PowerShell where full Win32_Process snapshot fails,
      // while single-PID filtered CIM query can succeed or fail per test mode.
      writeCrossPlatformExecutable(
        fakeBinDir,
        'powershell',
        `
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(callsLogPath)}, JSON.stringify({ bin: 'powershell', args }) + '\\n');
const mode = process.env.FAKE_POWERSHELL_MODE || 'snapshot-fails-single-succeeds';
const cmdIndex = args.indexOf('-Command');
const psCmd = cmdIndex !== -1 ? (args[cmdIndex + 1] || '') : args.join(' ');

if (mode === 'all-fail') {
  process.stderr.write('Get-CimInstance: WMI service unavailable\\n');
  process.exit(1);
}

const filterMatch = psCmd.match(/ProcessId\\s*=\\s*(\\d+)/);
if (!filterMatch) {
  // Unfiltered process-table snapshot fails (simulating timeout / maxBuffer / CIM failure)
  process.stderr.write('Get-CimInstance: Operation timed out\\n');
  process.exit(1);
}

const pid = Number(filterMatch[1]);
const singleCommand = process.env.FAKE_POWERSHELL_SINGLE_CMD || 'C:\\\\Program Files\\\\Microsoft VS Code\\\\Code.exe';
const singleName = process.env.FAKE_POWERSHELL_SINGLE_NAME || 'Code.exe';
process.stdout.write(JSON.stringify({
  ProcessId: pid,
  ParentProcessId: 0,
  Name: singleName,
  CommandLine: singleCommand,
}));
`,
      );

      platformOverride.value = 'win32';
      platformOverride.tmpDir = fakeTmpDir;

      vi.stubEnv(
        'PATH',
        `${fakeBinDir}${path.delimiter}${process.env['PATH'] ?? ''}`,
      );
      for (const envName of [
        'GEMINI_CLI_IDE_PID',
        'ANTIGRAVITY_CLI_ALIAS',
        'TERM_PROGRAM',
        'CURSOR_TRACE_ID',
        'CODESPACES',
        'EDITOR_IN_CLOUD_SHELL',
        'CLOUD_SHELL',
        'TERM_PRODUCT',
        'MONOSPACE_ENV',
        'REPLIT_USER',
        'POSITRON',
        '__COG_BASHRC_SOURCED',
        'TERMINAL_EMULATOR',
        'ZED_SESSION_ID',
        'XCODE_VERSION_ACTUAL',
        'SANDBOX',
        'GEMINI_CLI_IDE_SERVER_PORT',
        'GEMINI_CLI_IDE_SERVER_STDIO_COMMAND',
        'GEMINI_CLI_IDE_SERVER_STDIO_ARGS',
        'GEMINI_CLI_IDE_AUTH_TOKEN',
        'GEMINI_CLI_IDE_WORKSPACE_PATH',
        'NO_PROXY',
        'HTTP_PROXY',
        'HTTPS_PROXY',
      ]) {
        vi.stubEnv(envName, '');
      }
    });

    afterEach(async () => {
      await client?.disconnect();
      client = undefined;
      await companion?.close();
      companion = undefined;
      fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    function readRecordedCalls(): Array<{ bin: string; args: string[] }> {
      if (!fs.existsSync(callsLogPath)) {
        return [];
      }
      return fs
        .readFileSync(callsLogPath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { bin: string; args: string[] });
    }

    it('recovers process command via single-PID PowerShell CIM fallback, detects IDE accurately, and connects IdeClient without invoking ps', async () => {
      const authToken = 'win-fallback-test-token';
      companion = await startCompanionStandIn(authToken);

      const ideDir = path.join(fakeTmpDir, 'gemini', 'ide');
      fs.mkdirSync(ideDir, { recursive: true });
      fs.writeFileSync(
        path.join(
          ideDir,
          `gemini-ide-server-${process.pid}-${companion.port}.json`,
        ),
        JSON.stringify({
          port: companion.port,
          workspacePath: process.cwd(),
          authToken,
        }),
        'utf8',
      );

      vi.stubEnv('FAKE_POWERSHELL_MODE', 'snapshot-fails-single-succeeds');
      vi.stubEnv(
        'FAKE_POWERSHELL_SINGLE_CMD',
        'C:\\Users\\dev\\AppData\\Local\\Programs\\Windsurf\\Windsurf.exe',
      );
      vi.stubEnv('FAKE_POWERSHELL_SINGLE_NAME', 'Windsurf.exe');
      vi.stubEnv('TERM_PROGRAM', 'vscode');

      client = await freshIdeClient();
      await client.connect({ logToConsole: false });

      // Because command was recovered ('Windsurf.exe', which does not contain 'code'),
      // detectIde() accurately identifies it as a VS Code fork ('IDE') rather than
      // silently degrading to empty command '' (which misidentifies forks as 'VS Code').
      expect(client.getCurrentIde()).toEqual(IDE_DEFINITIONS.vscodefork);
      expect(client.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
      expect(client.isDiffingEnabled()).toBe(true);

      const calls = readRecordedCalls();
      expect(calls.filter((c) => c.bin === 'ps')).toEqual([]);
      expect(calls.filter((c) => c.bin === 'powershell')).toHaveLength(2);
      expect(calls[1]?.args.join(' ')).toContain(`ProcessId=${process.pid}`);
      expect(debugLogger.warn).toHaveBeenCalled();
    });

    it('detects specific JetBrains IDE on Windows via single-PID CIM fallback when snapshot fails', async () => {
      vi.stubEnv('FAKE_POWERSHELL_MODE', 'snapshot-fails-single-succeeds');
      vi.stubEnv(
        'FAKE_POWERSHELL_SINGLE_CMD',
        'C:\\Program Files\\JetBrains\\IntelliJ IDEA\\bin\\idea64.exe',
      );
      vi.stubEnv('FAKE_POWERSHELL_SINGLE_NAME', 'idea64.exe');
      vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');

      client = await freshIdeClient();

      expect(client.getCurrentIde()).toEqual(IDE_DEFINITIONS.intellijidea);
      const calls = readRecordedCalls();
      expect(calls.filter((c) => c.bin === 'ps')).toEqual([]);
      expect(calls.filter((c) => c.bin === 'powershell')).toHaveLength(2);
      expect(debugLogger.warn).toHaveBeenCalled();
    });

    it('degrades gracefully with debugLogger.warn and never invokes ps when both snapshot and CIM fallback fail', async () => {
      vi.stubEnv('FAKE_POWERSHELL_MODE', 'all-fail');
      vi.stubEnv('TERM_PROGRAM', 'vscode');

      const info = await getIdeProcessInfo();

      expect(info).toEqual({ pid: process.pid, command: '' });
      const calls = readRecordedCalls();
      expect(calls.filter((c) => c.bin === 'ps')).toEqual([]);
      expect(calls.filter((c) => c.bin === 'powershell')).toHaveLength(2);
      expect(debugLogger.warn).toHaveBeenCalled();
    });
  });
});
