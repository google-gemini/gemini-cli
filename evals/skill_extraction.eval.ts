/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, expect } from 'vitest';
import {
  Storage,
  SESSION_FILE_PREFIX,
  getProjectHash,
  startMemoryService,
} from '@google/gemini-cli-core';
import {
  loadCliConfig,
  type CliArgs,
} from '../packages/cli/src/config/config.js';
import {
  loadSettings,
  resetSettingsCacheForTesting,
} from '../packages/cli/src/config/settings.js';
import { validateNonInteractiveAuth } from '../packages/cli/src/validateNonInterActiveAuth.js';
import { evalTest, assertModelHasOutput, type TestRig } from './test-helper.js';

interface SeedSession {
  sessionId: string;
  summary: string;
  userTurns: string[];
  timestampOffsetMinutes: number;
}

const MEMORY_EXTRACTION_ARGV: CliArgs = {
  query: undefined,
  model: undefined,
  sandbox: undefined,
  debug: false,
  prompt: undefined,
  promptInteractive: undefined,
  yolo: true,
  approvalMode: 'yolo',
  policy: undefined,
  adminPolicy: undefined,
  allowedMcpServerNames: undefined,
  allowedTools: undefined,
  acp: false,
  experimentalAcp: false,
  extensions: undefined,
  listExtensions: false,
  resume: undefined,
  listSessions: false,
  deleteSession: undefined,
  includeDirectories: undefined,
  screenReader: false,
  useWriteTodos: undefined,
  outputFormat: undefined,
  fakeResponses: undefined,
  recordResponses: undefined,
  startupMessages: [],
  rawOutput: false,
  acceptRawOutputRisk: false,
  isCommand: false,
};

const WORKSPACE_FILES = {
  'package.json': JSON.stringify(
    {
      name: 'skill-extraction-eval',
      private: true,
      scripts: {
        build: 'echo build',
        lint: 'echo lint',
        test: 'echo test',
      },
    },
    null,
    2,
  ),
  'README.md': `# Skill Extraction Eval

This workspace exists to exercise background skill extraction from prior chats.
`,
};

function restoreGeminiHome(previousValue: string | undefined): void {
  if (previousValue === undefined) {
    delete process.env['GEMINI_CLI_HOME'];
  } else {
    process.env['GEMINI_CLI_HOME'] = previousValue;
  }
}

async function withRigStorage<T>(
  rig: TestRig,
  fn: (storage: Storage, projectRoot: string) => Promise<T>,
): Promise<T> {
  const previousGeminiHome = process.env['GEMINI_CLI_HOME'];
  process.env['GEMINI_CLI_HOME'] = rig.homeDir!;

  try {
    const projectRoot = fs.realpathSync(rig.testDir!);
    const storage = new Storage(projectRoot);
    await storage.initialize();
    return await fn(storage, projectRoot);
  } finally {
    restoreGeminiHome(previousGeminiHome);
  }
}

function buildMessages(userTurns: string[]) {
  const baseTime = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  return userTurns.flatMap((text, index) => [
    {
      id: `u${index + 1}`,
      timestamp: baseTime,
      type: 'user',
      content: [{ text }],
    },
    {
      id: `a${index + 1}`,
      timestamp: baseTime,
      type: 'gemini',
      content: [{ text: `Acknowledged: ${index + 1}` }],
    },
  ]);
}

async function seedSessions(
  rig: TestRig,
  sessions: SeedSession[],
): Promise<void> {
  await withRigStorage(rig, async (storage, projectRoot) => {
    const chatsDir = path.join(storage.getProjectTempDir(), 'chats');
    await fsp.mkdir(chatsDir, { recursive: true });

    for (const session of sessions) {
      const timestamp = new Date(
        Date.now() - session.timestampOffsetMinutes * 60 * 1000,
      )
        .toISOString()
        .slice(0, 16)
        .replace(/:/g, '-');
      const filename = `${SESSION_FILE_PREFIX}${timestamp}-${session.sessionId.slice(0, 8)}.json`;
      const conversation = {
        sessionId: session.sessionId,
        projectHash: getProjectHash(projectRoot),
        summary: session.summary,
        startTime: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
        lastUpdated: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        messages: buildMessages(session.userTurns),
      };

      await fsp.writeFile(
        path.join(chatsDir, filename),
        JSON.stringify(conversation, null, 2),
      );
    }
  });
}

async function waitForExtractionState(rig: TestRig): Promise<{
  state: { runs: Array<{ sessionIds: string[]; skillsCreated: string[] }> };
  skillsDir: string;
}> {
  return withRigStorage(rig, async (storage, projectRoot) => {
    // The headless CLI eval finishes and exits before its fire-and-forget
    // memory task can complete, so invoke the real memory service directly.
    const previousCwd = process.cwd();
    let config: Awaited<ReturnType<typeof loadCliConfig>> | undefined;

    process.chdir(projectRoot);

    try {
      resetSettingsCacheForTesting();
      const settings = loadSettings(projectRoot);
      config = await loadCliConfig(
        settings.merged,
        `skill-extraction-eval-${randomUUID().slice(0, 8)}`,
        MEMORY_EXTRACTION_ARGV,
        { cwd: projectRoot },
      );
      await config.initialize();

      const authType = await validateNonInteractiveAuth(
        settings.merged.security.auth.selectedType,
        settings.merged.security.auth.useExternal,
        config,
        settings,
      );
      await config.refreshAuth(authType);
      await startMemoryService(config);
    } finally {
      process.chdir(previousCwd);
      resetSettingsCacheForTesting();
      await config?.dispose();
    }

    const statePath = path.join(
      storage.getProjectMemoryTempDir(),
      '.extraction-state.json',
    );
    const skillsDir = storage.getProjectSkillsMemoryDir();

    const raw = await fsp.readFile(statePath, 'utf-8');
    const state = JSON.parse(raw) as {
      runs?: Array<{ sessionIds?: string[]; skillsCreated?: string[] }>;
    };
    if (!Array.isArray(state.runs) || state.runs.length === 0) {
      throw new Error(
        'Skill extraction finished without writing any run state',
      );
    }

    return {
      state: {
        runs: state.runs.map((run) => ({
          sessionIds: Array.isArray(run.sessionIds) ? run.sessionIds : [],
          skillsCreated: Array.isArray(run.skillsCreated)
            ? run.skillsCreated
            : [],
        })),
      },
      skillsDir,
    };
  });
}

async function readSkillBodies(skillsDir: string): Promise<string[]> {
  try {
    const entries = await fsp.readdir(skillsDir, { withFileTypes: true });
    const skillDirs = entries.filter((entry) => entry.isDirectory());
    const bodies = await Promise.all(
      skillDirs.map((entry) =>
        fsp.readFile(path.join(skillsDir, entry.name, 'SKILL.md'), 'utf-8'),
      ),
    );
    return bodies;
  } catch {
    return [];
  }
}

describe('Skill Extraction', () => {
  evalTest('USUALLY_PASSES', {
    suiteName: 'skill-extraction',
    suiteType: 'behavioral',
    name: 'ignores one-off incidents even when session summaries look similar',
    files: WORKSPACE_FILES,
    timeout: 180000,
    params: {
      settings: {
        experimental: {
          memoryManager: true,
        },
      },
    },
    setup: async (rig) => {
      await seedSessions(rig, [
        {
          sessionId: 'incident-login-redirect',
          summary: 'Debug login redirect loop in staging',
          timestampOffsetMinutes: 420,
          userTurns: [
            'We only need a one-off fix for incident INC-4412 on branch hotfix/login-loop.',
            'The exact failing string is ERR_REDIRECT_4412 and this workaround is incident-specific.',
            'Patch packages/auth/src/redirect.ts just for this branch and do not generalize it.',
            'The thing that worked was deleting the stale staging cookie before retrying.',
            'This is not a normal workflow and should not become a reusable instruction.',
            'It only reproduced against the 2026-04-08 staging rollout.',
            'After the cookie clear, the branch-specific redirect logic passed.',
            'Do not turn this incident writeup into a standing process.',
            'Yes, the hotfix worked for this exact redirect-loop incident.',
            'Close out INC-4412 once the staging login succeeds again.',
          ],
        },
        {
          sessionId: 'incident-login-timeout',
          summary: 'Debug login callback timeout in staging',
          timestampOffsetMinutes: 360,
          userTurns: [
            'This is another one-off staging incident, this time TICKET-991 for callback timeout.',
            'The exact failing string is ERR_CALLBACK_TIMEOUT_991 and it is unrelated to the redirect loop.',
            'The temporary fix was rotating the staging secret and deleting a bad feature-flag row.',
            'Do not write a generic login-debugging playbook from this.',
            'This only applied to the callback timeout during the April rollout.',
            'The successful fix was specific to the stale secret in staging.',
            'It does not define a durable repo workflow for future tasks.',
            'After rotating the secret, the callback timeout stopped reproducing.',
            'Treat this as incident response only, not a reusable skill.',
            'Once staging passed again, we closed TICKET-991.',
          ],
        },
      ]);
    },
    prompt:
      'Read the local workspace files and summarize this repository in two short sentences.',
    assert: async (rig, result) => {
      assertModelHasOutput(result);

      const { state, skillsDir } = await waitForExtractionState(rig);
      const skillBodies = await readSkillBodies(skillsDir);

      expect(state.runs).toHaveLength(1);
      expect(state.runs[0].sessionIds).toHaveLength(2);
      expect(state.runs[0].skillsCreated).toEqual([]);
      expect(skillBodies).toEqual([]);
    },
  });

  evalTest('USUALLY_PASSES', {
    suiteName: 'skill-extraction',
    suiteType: 'behavioral',
    name: 'extracts a repeated project-specific workflow into a skill',
    files: WORKSPACE_FILES,
    timeout: 180000,
    params: {
      settings: {
        experimental: {
          memoryManager: true,
        },
      },
    },
    setup: async (rig) => {
      await seedSessions(rig, [
        {
          sessionId: 'settings-docs-regen-1',
          summary: 'Update settings docs after adding a config option',
          timestampOffsetMinutes: 420,
          userTurns: [
            'When we add a new config option, we have to regenerate the settings docs in a specific order.',
            'The sequence that worked was npm run predocs:settings, npm run schema:settings, then npm run docs:settings.',
            'Do not hand-edit generated settings docs.',
            'If predocs is skipped, the generated schema docs miss the new defaults.',
            'Update the source first, then run that generation sequence.',
            'After regenerating, verify the schema output and docs changed together.',
            'We used this same sequence the last time we touched settings docs.',
            'That ordered workflow passed and produced the expected generated files.',
            'Please keep the exact command order because reversing it breaks the output.',
            'Yes, the generated settings docs were correct after those three commands.',
          ],
        },
        {
          sessionId: 'settings-docs-regen-2',
          summary: 'Regenerate settings schema docs for another new setting',
          timestampOffsetMinutes: 360,
          userTurns: [
            'We are touching another setting, so follow the same settings-doc regeneration workflow again.',
            'Run npm run predocs:settings before npm run schema:settings and npm run docs:settings.',
            'The project keeps generated settings docs in sync through those commands, not manual edits.',
            'Skipping predocs caused stale defaults in the generated output before.',
            'Change the source, then execute the same three commands in order.',
            'Verify both the schema artifact and docs update together after regeneration.',
            'This is the recurring workflow we use whenever a setting changes.',
            'The exact order worked again on this second settings update.',
            'Please preserve that ordering constraint for future settings changes.',
            'Confirmed: the settings docs regenerated correctly with the same command sequence.',
          ],
        },
      ]);
    },
    prompt:
      'Read the local workspace files and summarize this repository in two short sentences.',
    assert: async (rig, result) => {
      assertModelHasOutput(result);

      const { state, skillsDir } = await waitForExtractionState(rig);
      const skillBodies = await readSkillBodies(skillsDir);
      const combinedSkills = skillBodies.join('\n\n');

      expect(state.runs).toHaveLength(1);
      expect(state.runs[0].sessionIds).toHaveLength(2);
      expect(state.runs[0].skillsCreated.length).toBeGreaterThanOrEqual(1);
      expect(skillBodies.length).toBeGreaterThanOrEqual(1);
      expect(combinedSkills).toContain('npm run predocs:settings');
      expect(combinedSkills).toContain('npm run schema:settings');
      expect(combinedSkills).toContain('npm run docs:settings');
      expect(combinedSkills).toMatch(/When to Use/i);
      expect(combinedSkills).toMatch(/Verification/i);
    },
  });
});
