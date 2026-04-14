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
const SESSION_END_HOOK = join(REPO_ROOT, 'scripts', 'pcc_session_end_hook.py');

class SessionUpdateCollector implements acp.Client {
  updates: acp.SessionNotification[] = [];

  sessionUpdate = async (params: acp.SessionNotification) => {
    this.updates.push(params);
  };

  requestPermission = async (): Promise<acp.RequestPermissionResponse> => ({
    outcome: { outcome: 'cancelled' },
  });
}

describe('ACP PCC configured Jules session-end hook', () => {
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

  itMaybe(
    'runs a configured Jules runtime over ACP SessionEnd hooks',
    async () => {
      rig.setup('acp-pcc-jules-session-end', {
        fakeResponsesPath: join(
          import.meta.dirname,
          'hooks-system.allow-tool.responses',
        ),
        settings: {
          hooksConfig: {
            enabled: true,
          },
          hooks: {
            SessionEnd: [
              {
                matcher: 'exit',
                sequential: true,
                hooks: [
                  {
                    name: 'pcc-session-end-jules',
                    type: 'command',
                    command: `python3 "${SESSION_END_HOOK}"`,
                    timeout: 30000,
                    env: {
                      PCC_HOOK_RUNTIME: 'jules',
                      PCC_HOOK_MODEL: 'deep',
                      PCC_CRITIC_CONFIG_PATH: 'pcc-critic.test.json',
                    },
                  },
                ],
              },
            ],
          },
        },
      });

      const fakeJulesPath = rig.createScript(
        'fake-jules-runtime.cjs',
        [
          'const args = process.argv.slice(2);',
          'const flagValue = (flag) => {',
          '  const index = args.indexOf(flag);',
          "  return index >= 0 ? args[index + 1] ?? '' : '';",
          '};',
          "const model = flagValue('--model');",
          "const prompt = flagValue('--prompt');",
          'process.stdout.write(',
          '  `Fake Jules critique. However this still carries risk because transcript evidence can hide failure modes. Example follow-up: validate hook artifacts. model=${model}; prompt_chars=${prompt.length}`',
          ');',
        ].join('\n'),
      );

      const configPath = join(rig.testDir!, 'pcc-critic.test.json');
      await fs.writeFile(
        configPath,
        JSON.stringify(
          {
            runtime_commands: {
              jules: [
                'node',
                fakeJulesPath,
                '--prompt',
                '{prompt}',
                '--model',
                '{model}',
              ],
            },
          },
          null,
          2,
        ),
        'utf8',
      );

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
      const output = Readable.toWeb(
        child.stdout!,
      ) as ReadableStream<Uint8Array>;
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
      const sessionEndHookLog = hookLogs.find((log) =>
        log.hookCall.hook_name.includes('pcc-session-end-jules'),
      );

      expect(sessionEndHookLog).toBeDefined();
      expect(sessionEndHookLog?.hookCall.exit_code).toBe(0);
      expect(sessionEndHookLog?.hookCall.success).toBe(true);

      const reports = await fs.readdir(reportsDir);
      const sessionEndReportName = reports.find((name) =>
        name.startsWith('session-end-'),
      );

      expect(sessionEndReportName).toBeDefined();

      const report = JSON.parse(
        await fs.readFile(join(reportsDir, sessionEndReportName!), 'utf8'),
      ) as {
        hook: string;
        reason: string;
        result: {
          runtime: string;
          model: string;
          config_path: string;
          response: string;
          audit: { verdict: string };
        };
      };

      expect(report.hook).toBe('SessionEnd');
      expect(report.reason).toBe('exit');
      expect(report.result.runtime).toBe('jules');
      expect(report.result.model).toBe('gemini-3.1-pro-preview');
      expect(report.result.config_path).toBe(configPath);
      expect(report.result.response).toContain('Fake Jules critique.');
      expect(report.result.audit.verdict).toBe('PASS');
    },
  );
});
