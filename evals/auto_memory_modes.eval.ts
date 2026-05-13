/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { runEval } from './test-helper.js';
import { SESSION_FILE_PREFIX } from '../packages/core/src/services/chatRecordingService.js';

const evalState = vi.hoisted(() => ({
  sessionFilePath: '',
  debugLines: [] as string[],
}));

const mocks = vi.hoisted(() => ({
  localAgentCreate: vi.fn(),
}));

vi.mock('../packages/core/src/agents/local-executor.js', () => ({
  LocalAgentExecutor: {
    create: mocks.localAgentCreate,
  },
}));

vi.mock('../packages/core/src/agents/local-executor.ts', () => ({
  LocalAgentExecutor: {
    create: mocks.localAgentCreate,
  },
}));

vi.mock('../packages/core/src/agents/local-executor', () => ({
  LocalAgentExecutor: {
    create: mocks.localAgentCreate,
  },
}));

vi.mock('../packages/core/src/services/executionLifecycleService.js', () => ({
  ExecutionLifecycleService: {
    createExecution: vi.fn().mockReturnValue({ pid: 1001, result: {} }),
    completeExecution: vi.fn(),
  },
}));

vi.mock('../packages/core/src/services/executionLifecycleService.ts', () => ({
  ExecutionLifecycleService: {
    createExecution: vi.fn().mockReturnValue({ pid: 1001, result: {} }),
    completeExecution: vi.fn(),
  },
}));

vi.mock('../packages/core/src/services/executionLifecycleService', () => ({
  ExecutionLifecycleService: {
    createExecution: vi.fn().mockReturnValue({ pid: 1001, result: {} }),
    completeExecution: vi.fn(),
  },
}));

vi.mock('../packages/core/src/utils/debugLogger.js', () => ({
  debugLogger: {
    debug: (...args: unknown[]) =>
      evalState.debugLines.push(args.map(String).join(' ')),
    log: (...args: unknown[]) =>
      evalState.debugLines.push(args.map(String).join(' ')),
    warn: (...args: unknown[]) =>
      evalState.debugLines.push(args.map(String).join(' ')),
    error: (...args: unknown[]) =>
      evalState.debugLines.push(args.map(String).join(' ')),
  },
}));

vi.mock('../packages/core/src/utils/debugLogger.ts', () => ({
  debugLogger: {
    debug: (...args: unknown[]) =>
      evalState.debugLines.push(args.map(String).join(' ')),
    log: (...args: unknown[]) =>
      evalState.debugLines.push(args.map(String).join(' ')),
    warn: (...args: unknown[]) =>
      evalState.debugLines.push(args.map(String).join(' ')),
    error: (...args: unknown[]) =>
      evalState.debugLines.push(args.map(String).join(' ')),
  },
}));

vi.mock('../packages/core/src/utils/debugLogger', () => ({
  debugLogger: {
    debug: (...args: unknown[]) =>
      evalState.debugLines.push(args.map(String).join(' ')),
    log: (...args: unknown[]) =>
      evalState.debugLines.push(args.map(String).join(' ')),
    warn: (...args: unknown[]) =>
      evalState.debugLines.push(args.map(String).join(' ')),
    error: (...args: unknown[]) =>
      evalState.debugLines.push(args.map(String).join(' ')),
  },
}));

interface MockMemoryConfig {
  storage: {
    getProjectMemoryDir: () => string;
    getProjectMemoryTempDir: () => string;
    getProjectSkillsMemoryDir: () => string;
    getProjectTempDir: () => string;
    getProjectRoot: () => string;
  };
  getTargetDir: () => string;
  getToolRegistry: () => unknown;
  getGeminiClient: () => unknown;
  getSkillManager: () => { getSkills: () => unknown[] };
  isAutoMemoryEnabled: () => boolean;
  modelConfigService: {
    registerRuntimeModelConfig: ReturnType<typeof vi.fn>;
  };
  sandboxManager: undefined;
}

interface Fixture {
  rootDir: string;
  homeDir: string;
  targetDir: string;
  projectTempDir: string;
  memoryDir: string;
  skillsDir: string;
  config: MockMemoryConfig;
}

interface AutoMemoryRunSnapshot {
  sessionIds?: string[];
  memoryCandidatesCreated?: string[];
  memoryFilesUpdated?: string[];
  skillsCreated?: string[];
}

const fixtures: Fixture[] = [];

beforeEach(() => {
  vi.resetModules();
  evalState.debugLines = [];
  evalState.sessionFilePath = '';
  mocks.localAgentCreate.mockReset();
  mocks.localAgentCreate.mockImplementation(
    async (_agent, context, onActivity) => ({
      run: vi.fn().mockImplementation(async () => {
        if (evalState.sessionFilePath) {
          const callId = `read-inbox-routing`;
          onActivity({
            isSubagentActivityEvent: true,
            agentName: 'auto-memory-eval',
            type: 'TOOL_CALL_START',
            data: {
              name: 'read_file',
              callId,
              args: { file_path: evalState.sessionFilePath },
            },
          });
          onActivity({
            isSubagentActivityEvent: true,
            agentName: 'auto-memory-eval',
            type: 'TOOL_CALL_END',
            data: { id: callId, data: { isError: false } },
          });
        }

        const config = context.config as MockMemoryConfig;
        const memoryDir = config.storage.getProjectMemoryTempDir();
        const inboxDir = path.join(memoryDir, '.inbox');

        const homeDir = process.env['GEMINI_CLI_HOME'] ?? os.homedir();
        const globalGeminiDir = path.join(homeDir, '.gemini');

        await fs.mkdir(path.join(inboxDir, 'private'), { recursive: true });
        await fs.mkdir(path.join(inboxDir, 'global'), { recursive: true });

        const privateTarget = path.join(memoryDir, 'verify-memory.md');
        await fs.writeFile(
          path.join(inboxDir, 'private', 'verify-memory.patch'),
          [
            `--- /dev/null`,
            `+++ ${privateTarget}`,
            `@@ -0,0 +1,3 @@`,
            `+# Project Memory Candidate`,
            `+`,
            `+Future agents should remember that this project verifies memory changes with \`npm run verify:memory\`.`,
            ``,
          ].join('\n'),
        );

        const globalTarget = path.join(globalGeminiDir, 'GEMINI.md');
        await fs.writeFile(
          path.join(inboxDir, 'global', 'reply-style.patch'),
          [
            `--- /dev/null`,
            `+++ ${globalTarget}`,
            `@@ -0,0 +1,1 @@`,
            `+User prefers concise Chinese architecture plans.`,
            ``,
          ].join('\n'),
        );

        return {
          turn_count: 3,
          duration_ms: 25,
          terminate_reason: 'GOAL',
        };
      }),
    }),
  );
});

afterEach(async () => {
  vi.unstubAllEnvs();
  while (fixtures.length > 0) {
    const fixture = fixtures.pop();
    if (fixture) {
      await fs.rm(fixture.rootDir, { recursive: true, force: true });
    }
  }
});

function autoMemoryEval(name: string, fn: () => Promise<void>): void {
  runEval(
    'USUALLY_PASSES',
    {
      suiteName: 'auto-memory-modes',
      suiteType: 'component-level',
      name,
      timeout: 30000,
    },
    fn,
    40000,
  );
}

async function createFixture(): Promise<Fixture> {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'gemini-auto-memory-eval-'),
  );
  const homeDir = path.join(rootDir, 'home');
  const targetDir = path.join(rootDir, 'workspace');
  const projectTempDir = path.join(rootDir, 'project-temp');
  const memoryDir = path.join(projectTempDir, 'memory');
  const skillsDir = path.join(memoryDir, 'skills');

  await fs.mkdir(homeDir, { recursive: true });
  await fs.mkdir(targetDir, { recursive: true });
  await fs.mkdir(path.join(projectTempDir, 'chats'), { recursive: true });
  vi.stubEnv('GEMINI_CLI_HOME', homeDir);

  const config: MockMemoryConfig = {
    storage: {
      getProjectMemoryDir: () => memoryDir,
      getProjectMemoryTempDir: () => memoryDir,
      getProjectSkillsMemoryDir: () => skillsDir,
      getProjectTempDir: () => projectTempDir,
      getProjectRoot: () => targetDir,
    },
    getTargetDir: () => targetDir,
    getToolRegistry: () => ({}),
    getGeminiClient: () => ({}),
    getSkillManager: () => ({ getSkills: () => [] }),
    isAutoMemoryEnabled: () => true,
    modelConfigService: {
      registerRuntimeModelConfig: vi.fn(),
    },
    sandboxManager: undefined,
  };

  const fixture = {
    rootDir,
    homeDir,
    targetDir,
    projectTempDir,
    memoryDir,
    skillsDir,
    config,
  };
  fixtures.push(fixture);
  return fixture;
}

async function seedSession(
  fixture: Fixture,
  sessionId: string,
): Promise<string> {
  const sessionFilePath = path.join(
    fixture.projectTempDir,
    'chats',
    `${SESSION_FILE_PREFIX}2026-04-20T10-00-${sessionId}.json`,
  );
  const oldTimestamp = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const messages = Array.from({ length: 20 }, (_, index) => ({
    id: `m${index + 1}`,
    timestamp: oldTimestamp,
    type: index % 2 === 0 ? 'user' : 'gemini',
    content: [
      {
        text:
          index % 2 === 0
            ? 'For this project, durable memory changes are verified with `npm run verify:memory`.'
            : 'Acknowledged.',
      },
    ],
  }));

  await fs.writeFile(
    sessionFilePath,
    [
      {
        sessionId,
        projectHash: 'auto-memory-eval',
        summary: 'Capture durable auto memory routing behavior',
        startTime: oldTimestamp,
        lastUpdated: oldTimestamp,
        kind: 'main',
      },
      ...messages,
    ]
      .map((record) => JSON.stringify(record))
      .join('\n') + '\n',
  );

  return sessionFilePath;
}

async function expectSeedSessionEligible(
  fixture: Fixture,
  sessionId: string,
): Promise<void> {
  const { buildSessionIndex } = await import(
    '../packages/core/src/services/memoryService.js'
  );
  const { newSessionIds } = await buildSessionIndex(
    path.join(fixture.projectTempDir, 'chats'),
    { runs: [] },
  );
  expect(newSessionIds).toContain(sessionId);
}

async function readRun(fixture: Fixture): Promise<AutoMemoryRunSnapshot> {
  const statePath = path.join(fixture.memoryDir, '.extraction-state.json');
  let raw: string;
  try {
    raw = await fs.readFile(statePath, 'utf-8');
  } catch (error) {
    let memoryEntries = '(memory dir missing)';
    try {
      memoryEntries = (await fs.readdir(fixture.memoryDir, { recursive: true }))
        .map(String)
        .join('\n');
    } catch {
      // Leave default diagnostic.
    }
    throw new Error(
      [
        `Expected extraction state at ${statePath}.`,
        `LocalAgentExecutor.create calls: ${mocks.localAgentCreate.mock.calls.length}`,
        `Memory dir entries:\n${memoryEntries}`,
        `Debug log:\n${evalState.debugLines.join('\n')}`,
      ].join('\n'),
      { cause: error },
    );
  }
  const state = JSON.parse(raw) as {
    runs?: AutoMemoryRunSnapshot[];
  };
  const run = state.runs?.at(-1);
  if (!run) {
    throw new Error('Expected an auto memory extraction run to be recorded');
  }
  return run;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe('Auto Memory inbox routing', () => {
  autoMemoryEval(
    'every memory patch lands in .inbox/<kind>/ for review and active files stay untouched',
    async () => {
      const { startMemoryService } = await import(
        '../packages/core/src/services/memoryService.js'
      );
      const fixture = await createFixture();
      evalState.sessionFilePath = await seedSession(
        fixture,
        'inbox-routing-session',
      );
      await expectSeedSessionEligible(fixture, 'inbox-routing-session');

      await startMemoryService(fixture.config as never);

      const privatePatchPath = path.join(
        fixture.memoryDir,
        '.inbox',
        'private',
        'verify-memory.patch',
      );
      const globalPatchPath = path.join(
        fixture.memoryDir,
        '.inbox',
        'global',
        'reply-style.patch',
      );

      const activePrivateMemoryPath = path.join(
        fixture.memoryDir,
        'verify-memory.md',
      );
      const activeGlobalMemoryPath = path.join(
        fixture.homeDir,
        '.gemini',
        'GEMINI.md',
      );
      const run = await readRun(fixture);

      // Both patches were written to the inbox.
      await expect(fs.readFile(privatePatchPath, 'utf-8')).resolves.toContain(
        'npm run verify:memory',
      );
      await expect(fs.readFile(globalPatchPath, 'utf-8')).resolves.toContain(
        'concise Chinese architecture plans',
      );

      // No active file was touched — every patch must be reviewed manually.
      expect(await fileExists(activePrivateMemoryPath)).toBe(false);
      expect(await fileExists(activeGlobalMemoryPath)).toBe(false);

      // Run state records both patches as candidates and zero applied files.
      expect(run.memoryFilesUpdated ?? []).toEqual([]);
      expect(run.memoryCandidatesCreated ?? []).toEqual(
        expect.arrayContaining([
          path.relative(fixture.memoryDir, privatePatchPath),
          path.relative(fixture.memoryDir, globalPatchPath),
        ]),
      );
    },
  );
});
