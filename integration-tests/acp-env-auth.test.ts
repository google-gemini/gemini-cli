/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { spawn, ChildProcess } from 'node:child_process';
import { join, resolve } from 'node:path';
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

describe.skip('ACP Environment and Auth', () => {
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
    'should load .env from project directory and use the provided API key',
    async () => {
      rig.setup('acp-env-loading');

      // Create a project directory with a .env file containing a recognizable invalid key
      const projectDir = resolve(join(rig.testDir!, 'project'));
      mkdirSync(projectDir, { recursive: true });
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
          GEMINI_API_KEY: undefined,
          VERBOSE: 'true',
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

      // 1. newSession should succeed because it finds the key in .env
      const { sessionId } = await connection.newSession({
        cwd: projectDir,
        mcpServers: [],
      });

      expect(sessionId).toBeDefined();

      // 2. prompt should fail because the key is invalid,
      // but the error should come from the API, not the internal auth check.
      await expect(
        connection.prompt({
          sessionId,
          prompt: [{ type: 'text', text: 'hello' }],
        }),
      ).rejects.toSatisfy((error: unknown) => {
        const acpError = error as acp.RequestError;
        const errorData = acpError.data as
          | { error?: { message?: string } }
          | undefined;
        const message = String(errorData?.error?.message || acpError.message);
        // It should NOT be our internal "Authentication required" message
        expect(message).not.toContain('Authentication required');
        // It SHOULD be an API error mentioning the invalid key
        expect(message).toContain('API key not valid');
        return true;
      });

      child.stdin!.end();
    },
  );

  itMaybe(
    'should fail with authRequired when no API key is found',
    async () => {
      rig.setup('acp-auth-failure');

      const bundlePath = join(import.meta.dirname, '..', 'bundle/gemini.js');

      child = spawn('node', [bundlePath, '--experimental-acp'], {
        cwd: rig.homeDir!,
        stdio: ['pipe', 'pipe', 'inherit'],
        env: {
          ...process.env,
          GEMINI_CLI_HOME: rig.homeDir!,
          GEMINI_API_KEY: undefined,
          VERBOSE: 'true',
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
          cwd: resolve(rig.testDir!),
          mcpServers: [],
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining(
          'Gemini API key is missing or not configured.',
        ),
      });

      child.stdin!.end();
    },
  );
});
