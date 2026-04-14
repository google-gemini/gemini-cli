/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { TestRig } from './test-helper.js';
import { spawn, ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { Writable, Readable } from 'node:stream';
import { env } from 'node:process';
import * as fs from 'node:fs/promises';
import * as acp from '@agentclientprotocol/sdk';

const sandboxEnv = env['GEMINI_SANDBOX'];
const itMaybe = sandboxEnv && sandboxEnv !== 'false' ? it.skip : it;
const REPO_ROOT = join(import.meta.dirname, '..');
const AFTER_TOOL_HOOK = join(REPO_ROOT, 'scripts', 'pcc_after_tool_hook.py');

class SessionUpdateCollector implements acp.Client {
  updates: acp.SessionNotification[] = [];

  sessionUpdate = async (params: acp.SessionNotification) => {
    this.updates.push(params);
  };

  requestPermission = async (): Promise<acp.RequestPermissionResponse> => ({
    outcome: { outcome: 'cancelled' },
  });
}

describe('ACP PCC after-tool critic hook', () => {
  let rig: TestRig;
  let child: ChildProcess | undefined;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    child?.kill();
    child = undefined;
    await rig.cleanup();
  });

  itMaybe('writes an AfterTool PCC report over ACP', async () => {
    rig.setup('acp-pcc-after-tool', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'hooks-system.allow-tool.responses',
      ),
      settings: {
        hooksConfig: {
          enabled: true,
        },
        hooks: {
          AfterTool: [
            {
              matcher: 'write_file',
              sequential: true,
              hooks: [
                {
                  name: 'pcc-after-tool',
                  type: 'command',
                  command: `python3 "${AFTER_TOOL_HOOK}"`,
                  timeout: 30000,
                  env: {
                    PCC_HOOK_RUNTIME: 'audit-only',
                  },
                },
              ],
            },
          ],
        },
      },
    });

    const reportsDir = join(rig.testDir!, '.gemini', 'pcc-reports');
    await fs.mkdir(reportsDir, { recursive: true });

    const bundlePath = join(import.meta.dirname, '..', 'bundle/gemini.js');
    child = spawn(
      'node',
      [
        bundlePath,
        '--acp',
        '--fake-responses',
        join(rig.testDir!, 'fake-responses.json'),
      ],
      {
        cwd: rig.testDir!,
        stdio: ['pipe', 'pipe', 'inherit'],
        env: {
          ...process.env,
          GEMINI_API_KEY: 'fake-key',
          GEMINI_CLI_HOME: rig.homeDir!,
        },
      },
    );

    const input = Writable.toWeb(child.stdin!);
    const output = Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>;
    const testClient = new SessionUpdateCollector();
    const stream = acp.ndJsonStream(input, output);
    const connection = new acp.ClientSideConnection(() => testClient, stream);

    await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
      },
    });

    const { sessionId } = await connection.newSession({
      cwd: rig.testDir!,
      mcpServers: [],
    });

    await connection.setSessionMode({
      sessionId,
      modeId: 'yolo',
    });

    await connection.prompt({
      sessionId,
      prompt: [
        { type: 'text', text: 'Create approved.txt with Approved content' },
      ],
    });

    expect(rig.readFile('approved.txt')).toBe('Approved content');

    child.stdin!.end();
    await new Promise<void>((resolve) => {
      child!.on('close', () => resolve());
    });
    child = undefined;

    const hookLogs = rig.readHookLogs();
    const afterToolHookLog = hookLogs.find((log) =>
      log.hookCall.hook_name.includes('pcc-after-tool'),
    );

    expect(afterToolHookLog).toBeDefined();
    expect(afterToolHookLog?.hookCall.exit_code).toBe(0);
    expect(afterToolHookLog?.hookCall.success).toBe(true);
    expect(afterToolHookLog?.hookCall.hook_output).toBeDefined();

    const reports = await fs.readdir(reportsDir);
    const afterToolReportName = reports.find((name) =>
      name.startsWith('after-tool-'),
    );

    expect(afterToolReportName).toBeDefined();

    const report = JSON.parse(
      await fs.readFile(join(reportsDir, afterToolReportName!), 'utf8'),
    ) as {
      hook: string;
      tool_name: string;
      result: { audit: { verdict: string } };
    };

    expect(report.hook).toBe('AfterTool');
    expect(report.tool_name).toBe('write_file');
    expect(report.result.audit.verdict).toBeTypeOf('string');
  });
});
