/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig, GEMINI_DIR } from './test-helper.js';
import { spawn, ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { Writable, Readable } from 'node:stream';
import { env } from 'node:process';
import { inspect } from 'node:util';
import * as acp from '@agentclientprotocol/sdk';

const sandboxEnv = env['GEMINI_SANDBOX'];
const itMaybe = sandboxEnv && sandboxEnv !== 'false' ? it.skip : it;
class SessionUpdateCollector implements acp.Client {
  updates: acp.SessionNotification[] = [];

  sessionUpdate = async (params: acp.SessionNotification) => {
    this.updates.push(params);
  };

  requestPermission = async (): Promise<acp.RequestPermissionResponse> => {
    throw new Error('unexpected');
  };
}

function assertValidRegistryFile(projectsPath: string) {
  expect(existsSync(projectsPath)).toBe(true);

  const data = JSON.parse(readFileSync(projectsPath, 'utf8')) as unknown;
  expect(data).toMatchObject({
    projects: expect.any(Object),
  });

  expect(Array.isArray((data as { projects: unknown }).projects)).toBe(false);

  const entries = Object.entries(
    (data as { projects: Record<string, string> }).projects,
  );
  expect(entries.length).toBeGreaterThan(0);

  for (const [projectPath, shortId] of entries) {
    expect(typeof projectPath).toBe('string');
    expect(typeof shortId).toBe('string');
    expect(projectPath.length).toBeGreaterThan(0);
    expect(shortId.length).toBeGreaterThan(0);
  }
}

describe('ACP project registry startup recovery', () => {
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

  const testCases: Array<{
    name: string;
    setupProjectsFile: (projectsPath: string) => void;
  }> = [
    {
      name: 'missing projects.json',
      setupProjectsFile: (projectsPath) => {
        rmSync(projectsPath, { force: true });
      },
    },
    {
      name: 'projects.json as empty object',
      setupProjectsFile: (projectsPath) => {
        writeFileSync(projectsPath, '{}');
      },
    },
    {
      name: 'projects.json with invalid projects shape',
      setupProjectsFile: (projectsPath) => {
        writeFileSync(projectsPath, '{"projects":[]}');
      },
    },
    {
      name: 'projects.json with invalid JSON',
      setupProjectsFile: (projectsPath) => {
        writeFileSync(projectsPath, '{"projects":');
      },
    },
  ];

  testCases.forEach(({ name, setupProjectsFile }) => {
    itMaybe(`recovers from ${name} during ACP startup`, async () => {
      rig.setup(`acp-project-registry-${name}`);

      const userGeminiDir = join(rig.homeDir!, GEMINI_DIR);
      mkdirSync(userGeminiDir, { recursive: true });
      const projectsPath = join(userGeminiDir, 'projects.json');
      setupProjectsFile(projectsPath);

      const bundlePath = join(import.meta.dirname, '..', 'bundle/gemini.js');
      child = spawn(
        'node',
        [bundlePath, '--acp'],
        {
          cwd: rig.testDir!,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            GEMINI_API_KEY: 'fake-key',
            GEMINI_CLI_HOME: rig.homeDir!,
          },
        },
      );

      let stderr = '';
      child.stderr!.setEncoding('utf8');
      child.stderr!.on('data', (chunk: string) => {
        stderr += chunk;
      });

      const input = Writable.toWeb(child.stdin!);
      const output = Readable.toWeb(
        child.stdout!,
      ) as ReadableStream<Uint8Array>;
      const testClient = new SessionUpdateCollector();
      const stream = acp.ndJsonStream(input, output);
      const connection = new acp.ClientSideConnection(() => testClient, stream);

      let sessionId = '';
      try {
        await connection.initialize({
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
          },
        });

        ({ sessionId } = await connection.newSession({
          cwd: rig.testDir!,
          mcpServers: [],
        }));
      } catch (error) {
        throw new Error(
          `ACP startup failed for case "${name}". stderr:\n${stderr}\nOriginal error: ${String(
            error,
          )}\nInspected error: ${inspect(error, { depth: 10 })}`,
        );
      }

      expect(child.exitCode).toBeNull();
      expect(sessionId.length).toBeGreaterThan(0);
      assertValidRegistryFile(projectsPath);

      child.stdin!.end();
    }, 30000);
  });
});
