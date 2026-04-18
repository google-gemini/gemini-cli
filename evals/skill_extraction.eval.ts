/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { describe, expect } from 'vitest';
import {
  type Config,
  ApprovalMode,
  SESSION_FILE_PREFIX,
  getProjectHash,
  startMemoryService,
} from '@google/gemini-cli-core';
import { componentEvalTest } from './component-test-helper.js';

interface SeedSession {
  sessionId: string;
  summary: string;
  userTurns: string[];
  timestampOffsetMinutes: number;
}

interface MessageRecord {
  id: string;
  timestamp: string;
  type: string;
  content: Array<{ text: string }>;
}

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

function buildMessages(userTurns: string[]): MessageRecord[] {
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
  config: Config,
  sessions: SeedSession[],
): Promise<void> {
  const chatsDir = path.join(config.storage.getProjectTempDir(), 'chats');
  await fsp.mkdir(chatsDir, { recursive: true });

  const projectRoot = config.storage.getProjectRoot();

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
}

async function runExtractionAndReadState(config: Config): Promise<{
  state: { runs: Array<{ sessionIds: string[]; skillsCreated: string[] }> };
  skillsDir: string;
}> {
  await startMemoryService(config);

  const memoryDir = config.storage.getProjectMemoryTempDir();
  const skillsDir = config.storage.getProjectSkillsMemoryDir();
  const statePath = path.join(memoryDir, '.extraction-state.json');

  const raw = await fsp.readFile(statePath, 'utf-8');
  const state = JSON.parse(raw) as {
    runs?: Array<{ sessionIds?: string[]; skillsCreated?: string[] }>;
  };
  if (!Array.isArray(state.runs) || state.runs.length === 0) {
    throw new Error('Skill extraction finished without writing any run state');
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

/**
 * Shared configOverrides for all skill extraction component evals.
 * - experimentalAutoMemory: enables the Auto Memory skill extraction pipeline.
 * - approvalMode: YOLO auto-approves tool calls (write_file, read_file) so the
 *   background agent can execute without interactive confirmation.
 */
const EXTRACTION_CONFIG_OVERRIDES = {
  experimentalAutoMemory: true,
  approvalMode: ApprovalMode.YOLO,
};

describe('Skill Extraction', () => {
  componentEvalTest('USUALLY_PASSES', {
    suiteName: 'skill-extraction',
    suiteType: 'component-level',
    name: 'ignores one-off incidents even when session summaries look similar',
    files: WORKSPACE_FILES,
    timeout: 180000,
    configOverrides: EXTRACTION_CONFIG_OVERRIDES,
    setup: async (config) => {
      await seedSessions(config, [
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
    assert: async (config) => {
      const { state, skillsDir } = await runExtractionAndReadState(config);
      const skillBodies = await readSkillBodies(skillsDir);

      expect(state.runs).toHaveLength(1);
      expect(state.runs[0].sessionIds).toHaveLength(2);
      expect(state.runs[0].skillsCreated).toEqual([]);
      expect(skillBodies).toEqual([]);
    },
  });

  componentEvalTest('USUALLY_PASSES', {
    suiteName: 'skill-extraction',
    suiteType: 'component-level',
    name: 'extracts a repeated project-specific workflow into a skill',
    files: WORKSPACE_FILES,
    timeout: 180000,
    configOverrides: EXTRACTION_CONFIG_OVERRIDES,
    setup: async (config) => {
      await seedSessions(config, [
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
    assert: async (config) => {
      const { state, skillsDir } = await runExtractionAndReadState(config);
      const skillBodies = await readSkillBodies(skillsDir);
      const combinedSkills = skillBodies.join('\n\n');

      expect(state.runs).toHaveLength(1);
      expect(state.runs[0].sessionIds).toHaveLength(2);
      expect(state.runs[0].skillsCreated.length).toBeGreaterThanOrEqual(1);
      expect(skillBodies.length).toBeGreaterThanOrEqual(1);
      expect(combinedSkills).toContain('npm run predocs:settings');
      expect(combinedSkills).toContain('npm run schema:settings');
      expect(combinedSkills).toContain('npm run docs:settings');
      expect(combinedSkills).toMatch(/Verification/i);

      // Verify the extraction agent activated skill-creator for design guidance.
      expect(config.getSkillManager().isSkillActive('skill-creator')).toBe(
        true,
      );
    },
  });

  componentEvalTest('USUALLY_PASSES', {
    suiteName: 'skill-extraction',
    suiteType: 'component-level',
    name: 'extracts a repeated multi-step migration workflow with ordering constraints',
    files: WORKSPACE_FILES,
    timeout: 180000,
    configOverrides: EXTRACTION_CONFIG_OVERRIDES,
    setup: async (config) => {
      await seedSessions(config, [
        {
          sessionId: 'db-migration-v12',
          summary: 'Run database migration for v12 schema update',
          timestampOffsetMinutes: 420,
          userTurns: [
            'Every time we change the database schema we follow a specific migration workflow.',
            'First run npm run db:check to verify no pending migrations conflict.',
            'Then run npm run db:migrate to apply the new migration files.',
            'After migration, always run npm run db:validate to confirm schema integrity.',
            'If db:validate fails, immediately run npm run db:rollback before anything else.',
            'Never skip db:check — last time we did, two migrations collided and corrupted the index.',
            'The ordering is critical: check, migrate, validate. Reversing migrate and validate caused silent data loss before.',
            'This v12 migration passed after following that exact sequence.',
            'We use this same three-step workflow every time the schema changes.',
            'Confirmed: db:check, db:migrate, db:validate completed successfully for v12.',
          ],
        },
        {
          sessionId: 'db-migration-v13',
          summary: 'Run database migration for v13 schema update',
          timestampOffsetMinutes: 360,
          userTurns: [
            'New schema change for v13, following the same database migration workflow as before.',
            'Start with npm run db:check to ensure no conflicting pending migrations.',
            'Then npm run db:migrate to apply the v13 migration files.',
            'Then npm run db:validate to confirm the schema is consistent.',
            'If validation fails, run npm run db:rollback immediately — do not attempt manual fixes.',
            'We learned the hard way that skipping db:check causes index corruption.',
            'The check-migrate-validate order is mandatory for every schema change.',
            'This is the same recurring workflow we used for v12 and earlier migrations.',
            'The v13 migration passed with the same three-step sequence.',
            'Confirmed: the standard db migration workflow succeeded again for v13.',
          ],
        },
      ]);
    },
    assert: async (config) => {
      const { state, skillsDir } = await runExtractionAndReadState(config);
      const skillBodies = await readSkillBodies(skillsDir);
      const combinedSkills = skillBodies.join('\n\n');

      expect(state.runs).toHaveLength(1);
      expect(state.runs[0].sessionIds).toHaveLength(2);
      expect(state.runs[0].skillsCreated.length).toBeGreaterThanOrEqual(1);
      expect(skillBodies.length).toBeGreaterThanOrEqual(1);
      expect(combinedSkills).toContain('npm run db:check');
      expect(combinedSkills).toContain('npm run db:migrate');
      expect(combinedSkills).toContain('npm run db:validate');
      expect(combinedSkills).toMatch(/rollback/i);

      // Verify the extraction agent activated skill-creator for design guidance.
      expect(config.getSkillManager().isSkillActive('skill-creator')).toBe(
        true,
      );
    },
  });
});
