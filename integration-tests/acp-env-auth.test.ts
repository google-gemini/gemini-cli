/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { spawn, ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { Writable, Readable } from 'node:stream';
import { env } from 'node:process';
import * as acp from '@agentclientprotocol/sdk';

const sandboxEnv = env['GEMINI_SANDBOX'];
const itMaybe = sandboxEnv && sandboxEnv !== 'false' ? it.skip : it;

class MockClient implements acp.Client {
  updates: acp.SessionNotification[] = [];
  sessionUpdate = async (params: acp.SessionNotification) => {
    this.updates.push(params);
  };
  requestPermission = async (): Promise<acp.RequestPermissionResponse> => {
    throw new Error('unexpected');
  };
}

describe('ACP Environment and Auth', () => {
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
    'should load .env from project directory and fail if API key is invalid',
    async () => {
      rig.setup('acp-env-loading');

      // Create a project directory with a .env file
      const projectDir = join(rig.testDir!, 'project');
      mkdirSync(projectDir);
      writeFileSync(
        join(projectDir, '.env'),
        'GEMINI_API_KEY=test-key-from-env\n',
      );

      const bundlePath = join(import.meta.dirname, '..', 'bundle/gemini.js');

      child = spawn('node', [bundlePath, '--experimental-acp'], {
        cwd: rig.homeDir!,
        stdio: ['pipe', 'pipe', 'inherit'],
        env: {
          ...process.env,
          GEMINI_CLI_HOME: rig.homeDir!,
          GEMINI_API_KEY: '',
        },
      });

      const input = Writable.toWeb(child.stdin!);
      const output = Readable.toWeb(
        child.stdout!,
      ) as ReadableStream<Uint8Array>;
      const testClient = new MockClient();
      const stream = acp.ndJsonStream(input, output);
      const connection = new acp.ClientSideConnection(() => testClient, stream);

      await connection.initialize({
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
        },
      });

      try {
        await connection.newSession({
          cwd: projectDir,
          mcpServers: [],
        });
      } catch (error) {
        if (error instanceof Error) {
          expect(error.message).not.toContain('Authentication required');
        } else {
          throw error;
        }
      }

      child.stdin!.end();
    },
  );

  itMaybe(
    'should fail with authRequired when no API key is found',
    async () => {
      rig.setup('acp-auth-failure');

      const bundlePath = join(import.meta.dirname, '..', 'bundle/gemini.js');

      child = spawn('node', [bundlePath, '--experimental-acp'], {
        cwd: rig.testDir!,
        stdio: ['pipe', 'pipe', 'inherit'],
        env: {
          ...process.env,
          GEMINI_CLI_HOME: rig.homeDir!,
          GEMINI_API_KEY: '',
        },
      });

      const input = Writable.toWeb(child.stdin!);
      const output = Readable.toWeb(
        child.stdout!,
      ) as ReadableStream<Uint8Array>;
      const testClient = new MockClient();
      const stream = acp.ndJsonStream(input, output);
      const connection = new acp.ClientSideConnection(() => testClient, stream);

      await connection.initialize({
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
        },
      });

      await expect(
        connection.newSession({
          cwd: rig.testDir!,
          mcpServers: [],
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('Authentication required'),
      });

      child.stdin!.end();
    },
  );
});
