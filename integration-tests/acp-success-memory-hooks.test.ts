/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { TestRig } from './test-helper.js';
import { spawn, ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { Writable, Readable } from 'node:stream';
import { env } from 'node:process';
import * as acp from '@agentclientprotocol/sdk';

const sandboxEnv = env['GEMINI_SANDBOX'];
const itMaybe = sandboxEnv && sandboxEnv !== 'false' ? it.skip : it;

class SessionUpdateCollector implements acp.Client {
  updates: acp.SessionNotification[] = [];

  sessionUpdate = async (params: acp.SessionNotification) => {
    this.updates.push(params);
  };

  requestPermission = async (): Promise<acp.RequestPermissionResponse> => ({
    outcome: { outcome: 'cancelled' },
  });
}

describe('ACP success-memory hooks', () => {
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
    'should update golden path on successful AfterTool and checkpoint on SessionEnd over ACP',
    async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      try {
        rig.setup('acp-success-memory-hooks', {
          fakeResponsesPath: join(
            import.meta.dirname,
            'hooks-system.allow-tool.responses',
          ),
        });

        const memoryPath = join(rig.testDir!, 'success-memory.md');
        const goldenPathCommand =
          'npm exec -w packages/vscode-ide-companion vitest run src/newgate-ui.test.ts src/extension.test.ts';

        const afterToolScript = rig.createScript(
          'after_tool_success_memory.cjs',
          `const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const memoryPath = ${JSON.stringify(memoryPath)};
const toolName = String(input.tool_name ?? input.toolName ?? 'unknown');
const lines = [
  '# Golden path update',
  '- [repo依存] Source: AfterTool',
  '- [repo依存] Matched tool: ' + toolName,
  '- [repo依存] Trigger: successful write_file during ACP session',
  '- [repo依存] Command: ${goldenPathCommand}',
  '',
].join('\\n');
fs.appendFileSync(memoryPath, lines, 'utf8');
console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'AfterTool',
    additionalContext: 'Golden path memory updated from successful tool execution.'
  }
}));`,
        );

        const sessionEndScript = rig.createScript(
          'session_end_checkpoint_memory.cjs',
          `const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const memoryPath = ${JSON.stringify(memoryPath)};
const lines = [
  '# Session checkpoint',
  '- [固定] Success summaries update on checkpoint-close, not every trivial event.',
  '- [repo依存] Source: SessionEnd',
  '- [repo依存] Reason: ' + input.reason,
  '',
].join('\\n');
fs.appendFileSync(memoryPath, lines, 'utf8');
console.log(JSON.stringify({}));`,
        );

        rig.setup('acp-success-memory-hooks', {
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
                      type: 'command',
                      command: `node "${afterToolScript}"`,
                      timeout: 5000,
                    },
                  ],
                },
              ],
              SessionEnd: [
                {
                  matcher: 'exit',
                  sequential: true,
                  hooks: [
                    {
                      type: 'command',
                      command: `node "${sessionEndScript}"`,
                      timeout: 5000,
                    },
                  ],
                },
              ],
            },
          },
        });

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
        const connection = new acp.ClientSideConnection(
          () => testClient,
          stream,
        );

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
        const afterToolLog = hookLogs.find(
          (log) =>
            log.hookCall.hook_event_name === 'AfterTool' &&
            log.hookCall.hook_name.includes('after_tool_success_memory.cjs'),
        );

        expect(afterToolLog).toBeDefined();
        expect(afterToolLog?.hookCall.exit_code).toBe(0);

        const memory = rig.readFile('success-memory.md');
        expect(memory).toContain('# Golden path update');
        expect(memory).toContain(goldenPathCommand);
        expect(memory).toContain('# Session checkpoint');
        expect(memory).toContain('Reason: exit');

        const parseWarningLines = consoleErrorSpy.mock.calls
          .filter(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Failed to parse JSON message:'),
          )
          .map((call) => String(call[1] ?? ''));

        expect(parseWarningLines).toEqual([]);
      } finally {
        consoleErrorSpy.mockRestore();
      }
    },
  );
});
