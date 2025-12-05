/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { spawn, ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { Writable, Readable } from 'node:stream';
import { env } from 'node:process';
import * as acp from '@agentclientprotocol/sdk';

// Skip in sandbox mode - test spawns CLI directly which behaves differently in containers
const sandboxEnv = env['GEMINI_SANDBOX'];
const itMaybe = sandboxEnv && sandboxEnv !== 'false' ? it.skip : it;

const READ_RESPONSES_PATH = 'acp-filesystem.read.responses';
const WRITE_RESPONSES_PATH = 'acp-filesystem.write.responses';

function collectMessages(updates: acp.SessionNotification[]): string {
  return updates
    .filter((u) => u.update.sessionUpdate === 'agent_message_chunk')
    .map((u) => {
      const upd = u.update;
      if (upd.sessionUpdate === 'agent_message_chunk') {
        const content = upd.content;
        return content && 'text' in content ? content.text : '';
      }
      return '';
    })
    .join('');
}

describe('ACP filesystem', () => {
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

  itMaybe('delegates read_file to ACP client', async () => {
    rig.setup('acp-filesystem-read', {
      fakeResponsesPath: join(import.meta.dirname, READ_RESPONSES_PATH),
      settings: { tools: { core: ['read_file'] } },
    });

    rig.createFile('test.txt', 'local content');

    const bundlePath = join(import.meta.dirname, '..', 'bundle/gemini.js');
    child = spawn(
      'node',
      [
        bundlePath,
        '--experimental-acp',
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

    const updates: acp.SessionNotification[] = [];
    let readTextFilePath: string | null = null;

    const client: acp.Client = {
      sessionUpdate: async (params) => {
        updates.push(params);
      },
      requestPermission: async () => ({
        outcome: { outcome: 'selected', optionId: 'proceed_once' },
      }),
      readTextFile: async (params) => {
        readTextFilePath = params.path;
        return { content: 'client content' };
      },
      writeTextFile: async () => {},
    };

    const input = Writable.toWeb(child.stdin!);
    const output = Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>;
    const stream = acp.ndJsonStream(input, output);
    const connection = new acp.ClientSideConnection(() => client, stream);

    await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
    });

    const { sessionId } = await connection.newSession({
      cwd: rig.testDir!,
      mcpServers: [],
    });

    const result = await connection.prompt({
      sessionId,
      prompt: [{ type: 'text', text: 'Read test.txt' }],
    });

    expect(result).toEqual({ stopReason: 'end_turn' });
    expect(readTextFilePath).toBeTruthy();
    expect(readTextFilePath).toContain('test.txt');
    expect(collectMessages(updates)).toContain('client content');
  });

  itMaybe(
    'treats ACP RESOURCE_NOT_FOUND as ENOENT during write_file',
    async () => {
      rig.setup('acp-filesystem-write', {
        fakeResponsesPath: join(import.meta.dirname, WRITE_RESPONSES_PATH),
        settings: { tools: { core: ['write_file'] } },
      });

      const bundlePath = join(import.meta.dirname, '..', 'bundle/gemini.js');
      child = spawn(
        'node',
        [
          bundlePath,
          '--experimental-acp',
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

      const updates: acp.SessionNotification[] = [];
      let writeTextFileCalled = false;
      let writeTextFilePath: string | null = null;
      let writeTextFileContent: string | null = null;

      const client: acp.Client = {
        sessionUpdate: async (params) => {
          updates.push(params);
        },
        requestPermission: async () => ({
          outcome: { outcome: 'selected', optionId: 'proceed_once' },
        }),
        readTextFile: async (params) => {
          throw new acp.RequestError(
            -32002,
            `Resource not found: ${params.path}`,
            { uri: params.path },
          );
        },
        writeTextFile: async (params) => {
          writeTextFileCalled = true;
          writeTextFilePath = params.path;
          writeTextFileContent = params.content;
        },
      };

      const input = Writable.toWeb(child.stdin!);
      const output = Readable.toWeb(
        child.stdout!,
      ) as ReadableStream<Uint8Array>;
      const stream = acp.ndJsonStream(input, output);
      const connection = new acp.ClientSideConnection(() => client, stream);

      await connection.initialize({
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
      });

      const { sessionId } = await connection.newSession({
        cwd: rig.testDir!,
        mcpServers: [],
      });

      const result = await connection.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'Write hello to new-file.txt' }],
      });

      expect(result).toEqual({ stopReason: 'end_turn' });
      expect(writeTextFileCalled).toBe(true);
      expect(writeTextFilePath).toBeTruthy();
      expect(writeTextFilePath).toContain('new-file.txt');
      expect(writeTextFileContent).toBe('hello');

      const toolCompleted = updates.find((u) => {
        const upd = u.update;
        return (
          upd.sessionUpdate === 'tool_call_update' && upd.status === 'completed'
        );
      });
      expect(toolCompleted).toBeDefined();
    },
  );
});
