/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { spawn, ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { Writable, Readable } from 'node:stream';
import { env } from 'node:process';
import * as acp from '@agentclientprotocol/sdk';

// Skip in sandbox mode - test spawns CLI directly which behaves differently in containers
const sandboxEnv = env['GEMINI_SANDBOX'];
const itMaybe = sandboxEnv && sandboxEnv !== 'false' ? it.skip : it;

// Reuse existing fake responses that return a simple "Hello" response
const SIMPLE_RESPONSE_PATH = 'hooks-system.session-startup.responses';

class SessionUpdateCollector implements acp.Client {
  updates: acp.SessionNotification[] = [];

  sessionUpdate = async (params: acp.SessionNotification) => {
    this.updates.push(params);
  };

  requestPermission = async (): Promise<acp.RequestPermissionResponse> => {
    throw new Error('unexpected');
  };
}

describe('ACP telemetry', () => {
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

  itMaybe('should flush telemetry when connection closes', async () => {
    rig.setup('acp-telemetry-flush', {
      fakeResponsesPath: join(import.meta.dirname, SIMPLE_RESPONSE_PATH),
    });

    const telemetryPath = join(rig.homeDir!, 'telemetry.log');
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
          GEMINI_TELEMETRY_ENABLED: 'true',
          GEMINI_TELEMETRY_TARGET: 'local',
          GEMINI_TELEMETRY_OUTFILE: telemetryPath,
          // GEMINI_DEV_TRACING not set: fake responses aren't instrumented for spans
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
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
    });

    const { sessionId } = await connection.newSession({
      cwd: rig.testDir!,
      mcpServers: [],
    });

    await connection.prompt({
      sessionId,
      prompt: [{ type: 'text', text: 'Say hello' }],
    });

    expect(JSON.stringify(testClient.updates)).toContain('Hello');

    // Close stdin to trigger telemetry flush via runExitCleanup()
    child.stdin!.end();
    await new Promise<void>((resolve) => {
      child!.on('close', () => resolve());
    });
    child = undefined;

    // gen_ai.output.messages is the last OTEL log emitted (after prompt response)
    expect(existsSync(telemetryPath)).toBe(true);
    expect(readFileSync(telemetryPath, 'utf-8')).toContain(
      'gen_ai.output.messages',
    );
  });
});
