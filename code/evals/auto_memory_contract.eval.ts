/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live-LLM evals that pin down the auto-memory inbox contract:
 *   1. Canonical filename — agent uses `.inbox/<kind>/extraction.patch`.
 *   2. Incremental merge — agent rewrites an existing extraction.patch
 *      instead of creating new patch files alongside.
 *   3. Absolute-path pointers — when the agent creates a sibling .md, the
 *      paired MEMORY.md hunk references it by absolute path.
 *   4. Project-root protection — agent never writes to
 *      `<projectRoot>/GEMINI.md` even when content is team-shared.
 *
 * Each test seeds session transcripts with strong, consistent signal so the
 * extraction agent will reasonably produce SOME output (or, in the human-only
 * test, refrain from producing output that targets forbidden paths). Tests
 * are USUALLY_PASSES policy because LLM behavior is stochastic; the harness
 * already retries up to 3 times.
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
  /** Minutes ago the session ended (must be ≥ 180 to clear the idle gate). */
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
      name: 'auto-memory-contract-eval',
      private: true,
      scripts: { build: 'echo build', test: 'echo test' },
    },
    null,
    2,
  ),
  'README.md': '# Auto Memory Contract Eval\n\nFixture workspace.\n',
};

const EXTRACTION_CONFIG_OVERRIDES = {
  experimentalAutoMemory: true,
  approvalMode: ApprovalMode.YOLO,
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
      content: [{ text: 'Acknowledged.' }],
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
    const sessionTimestamp = new Date(
      Date.now() - session.timestampOffsetMinutes * 60 * 1000,
    );
    const timestamp = sessionTimestamp
      .toISOString()
      .slice(0, 16)
      .replace(/:/g, '-');
    const filename = `${SESSION_FILE_PREFIX}${timestamp}-${session.sessionId.slice(0, 8)}.json`;
    const conversation = {
      sessionId: session.sessionId,
      projectHash: getProjectHash(projectRoot),
      summary: session.summary,
      startTime: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
      lastUpdated: sessionTimestamp.toISOString(),
      messages: buildMessages(session.userTurns),
    };
    await fsp.writeFile(
      path.join(chatsDir, filename),
      JSON.stringify(conversation, null, 2),
    );
  }
}

interface InboxSnapshot {
  privateFiles: string[];
  globalFiles: string[];
  privateContents: Map<string, string>;
}

async function snapshotInbox(config: Config): Promise<InboxSnapshot> {
  const memoryDir = config.storage.getProjectMemoryTempDir();
  const inbox: InboxSnapshot = {
    privateFiles: [],
    globalFiles: [],
    privateContents: new Map(),
  };
  for (const kind of ['private', 'global'] as const) {
    const dir = path.join(memoryDir, '.inbox', kind);
    let entries: string[];
    try {
      entries = await fsp.readdir(dir);
    } catch {
      continue;
    }
    const patchFiles = entries.filter((f) => f.endsWith('.patch')).sort();
    if (kind === 'private') {
      inbox.privateFiles = patchFiles;
      for (const fileName of patchFiles) {
        try {
          inbox.privateContents.set(
            fileName,
            await fsp.readFile(path.join(dir, fileName), 'utf-8'),
          );
        } catch {
          // ignore
        }
      }
    } else {
      inbox.globalFiles = patchFiles;
    }
  }
  return inbox;
}

describe('Auto Memory Contract', () => {
  componentEvalTest('USUALLY_PASSES', {
    suiteName: 'auto-memory-contract',
    suiteType: 'component-level',
    name: 'uses canonical extraction.patch filename when writing private memory',
    files: WORKSPACE_FILES,
    timeout: 240000,
    configOverrides: EXTRACTION_CONFIG_OVERRIDES,
    setup: async (config) => {
      await seedSessions(config, [
        {
          sessionId: 'verify-memory-cmd-1',
          summary:
            'Confirm that this project verifies memory edits with `npm run verify:memory`',
          timestampOffsetMinutes: 420,
          userTurns: [
            'For this project, every memory-system change is verified with `npm run verify:memory` before we hand the change back.',
            'That command is the gate. Without it the change is not considered done.',
            'It runs typechecks, the related unit tests, and a snapshot diff.',
            'Future agents working on memory should always run it after editing memoryService or commands/memory.ts.',
            'This is a durable rule for this project, not a one-off.',
            'The check is fast, under a minute, and failure means revert.',
            'Treat it as part of the memory subsystem contract.',
            'I want this remembered for next time.',
            'It applies to anything in packages/core/src/services/memoryService.ts and packages/core/src/commands/memory.ts.',
            'Make sure agents do not skip the verify step.',
          ],
        },
        {
          sessionId: 'verify-memory-cmd-2',
          summary: 'Same memory-verify command in another session',
          timestampOffsetMinutes: 360,
          userTurns: [
            'I had to remind the previous agent to run `npm run verify:memory` again.',
            'It is the durable verification command for memory edits in this repo.',
            'The agent forgot, even though we agreed last time.',
            'Please remember it for future memory-related work.',
            'It is the official verification step for memory changes.',
            'Run it whenever you touch memoryService.ts or commands/memory.ts.',
            'No exceptions. The command must finish green.',
            'This is a recurring rule across multiple sessions now.',
            'Make this part of your standard workflow for memory work.',
            'Verified again that the command catches regressions in MEMORY.md handling.',
          ],
        },
      ]);
    },
    assert: async (config) => {
      await startMemoryService(config);
      const inbox = await snapshotInbox(config);

      // Either the agent extracted nothing (acceptable no-op) OR it extracted
      // exactly one canonical file per kind. Multiple files per kind violates
      // the contract.
      expect(inbox.privateFiles.length).toBeLessThanOrEqual(1);
      expect(inbox.globalFiles.length).toBeLessThanOrEqual(1);

      // Strong assertion: when the agent DID write a private patch, it must
      // be the canonical filename.
      if (inbox.privateFiles.length === 1) {
        expect(inbox.privateFiles[0]).toBe('extraction.patch');
      }
      if (inbox.globalFiles.length === 1) {
        expect(inbox.globalFiles[0]).toBe('extraction.patch');
      }
    },
  });

  componentEvalTest('USUALLY_PASSES', {
    suiteName: 'auto-memory-contract',
    suiteType: 'component-level',
    name: 'merges new findings into existing extraction.patch instead of creating new files',
    files: WORKSPACE_FILES,
    timeout: 240000,
    configOverrides: EXTRACTION_CONFIG_OVERRIDES,
    setup: async (config) => {
      const memoryDir = config.storage.getProjectMemoryTempDir();
      const inboxPrivate = path.join(memoryDir, '.inbox', 'private');
      await fsp.mkdir(inboxPrivate, { recursive: true });

      // Pre-existing canonical patch left over from a prior session.
      const existingMemoryMd = path.join(memoryDir, 'MEMORY.md');
      const preExistingPatch = [
        `--- /dev/null`,
        `+++ ${existingMemoryMd}`,
        `@@ -0,0 +1,3 @@`,
        `+# Project Memory`,
        `+`,
        `+- This project lints with \`npm run lint\` (recurring rule from session 1).`,
        ``,
      ].join('\n');
      await fsp.writeFile(
        path.join(inboxPrivate, 'extraction.patch'),
        preExistingPatch,
      );

      // New session that surfaces a different durable fact.
      await seedSessions(config, [
        {
          sessionId: 'incremental-typecheck-cmd',
          summary:
            'Confirm that typecheck for memory edits uses `npm run typecheck`',
          timestampOffsetMinutes: 420,
          userTurns: [
            'Always run `npm run typecheck` after editing any *.ts file in this repo.',
            'It is the standard typecheck command for the whole monorepo.',
            'Future agents should follow this without being reminded.',
            'It catches type errors before tests, much faster.',
            'Run it on every TypeScript edit, no exceptions.',
            'This is durable across the whole project.',
            'It is the project-wide convention for TS work.',
            'Make sure to run it after edits to memoryService.ts especially.',
            'It is fast and catches regressions early.',
            'Treat it as standard workflow.',
          ],
        },
      ]);
    },
    assert: async (config) => {
      await startMemoryService(config);
      const inbox = await snapshotInbox(config);

      // Contract: still ONLY ONE file in private inbox, and its name is the
      // canonical extraction.patch.
      expect(inbox.privateFiles).toEqual(['extraction.patch']);

      // The single canonical patch must STILL contain the old hunk (the
      // agent must merge with existing rather than replace blindly), AND
      // ideally also contain the new typecheck fact.
      const merged = inbox.privateContents.get('extraction.patch') ?? '';
      expect(merged).toMatch(/npm run lint/);
      // Soft assertion: the agent SHOULD have added the new fact too. We
      // don't fail the test if it didn't (the agent may legitimately decide
      // the new fact isn't durable enough), but the file must be intact.
      // The hard assertion (no proliferation + old content preserved) is
      // what we lock down.
    },
  });

  componentEvalTest('USUALLY_PASSES', {
    suiteName: 'auto-memory-contract',
    suiteType: 'component-level',
    name: 'uses absolute paths in MEMORY.md sibling pointer lines',
    files: WORKSPACE_FILES,
    timeout: 240000,
    configOverrides: EXTRACTION_CONFIG_OVERRIDES,
    setup: async (config) => {
      // Sessions whose extracted memory has substantial detail — encourages
      // the agent to spawn a sibling .md file (per prompt guidance).
      await seedSessions(config, [
        {
          sessionId: 'detailed-release-workflow-1',
          summary: 'Detailed release workflow that runs across multiple steps',
          timestampOffsetMinutes: 420,
          userTurns: [
            'Our release workflow has several distinct phases that future agents need to follow exactly.',
            'Phase 1 (preflight): run `npm run lint`, `npm run typecheck`, and `npm test` in that order.',
            'Phase 2 (build): run `npm run build` and verify dist/ outputs against a checksum file.',
            'Phase 3 (publish): run `npm run publish:dry-run` first, then `npm run publish` if no errors.',
            'Phase 4 (post): tag the commit with `git tag v$(jq -r .version package.json)` and push.',
            'There are pitfalls: phase 2 will silently succeed if dist/ is stale, so always check the checksum.',
            'Phase 3 must NEVER be skipped for hotfixes; the dry-run catches credential issues.',
            'The checklist is durable across all releases for this repo.',
            'Future agents should reproduce these phases in order without omitting any.',
            'This is the canonical release procedure for this project.',
          ],
        },
        {
          sessionId: 'detailed-release-workflow-2',
          summary: 'Reusing the same multi-phase release workflow',
          timestampOffsetMinutes: 360,
          userTurns: [
            'I just ran the release workflow again and it caught an issue in phase 2 because the checksum mismatched.',
            'Confirms the durable rule: always check the dist/ checksum after building.',
            'The 4-phase release procedure (preflight, build, publish, post) is the recurring workflow.',
            'I want this captured as durable memory because we use it every release.',
            'Each phase has multiple sub-steps and pitfalls, so it deserves substantial detail.',
            'Please remember the phases for future agents.',
            'The procedure has been the same for the last 6 releases.',
            'It includes the verify-checksum step that just saved us from a bad publish.',
            'This is a recurring multi-step workflow, not a one-off.',
            'Make sure future sessions know about all 4 phases and their pitfalls.',
          ],
        },
      ]);
    },
    assert: async (config) => {
      await startMemoryService(config);
      const inbox = await snapshotInbox(config);
      const memoryDir = config.storage.getProjectMemoryTempDir();

      // The agent might choose to add brief facts directly to MEMORY.md
      // without spawning a sibling. That's a valid outcome; we only enforce
      // the absolute-path rule WHEN a sibling is created.
      if (inbox.privateFiles.length === 0) {
        return; // No-op extraction: nothing to assert.
      }
      expect(inbox.privateFiles).toEqual(['extraction.patch']);

      const patch = inbox.privateContents.get('extraction.patch') ?? '';

      // Find any /dev/null sibling-creation hunk that targets <memoryDir>/<x>.md
      // (where x != MEMORY).
      const siblingPattern = new RegExp(
        `\\+\\+\\+ ${memoryDir.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}/([^\\s/]+)\\.md`,
        'g',
      );
      const siblingTargets: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = siblingPattern.exec(patch)) !== null) {
        const name = match[1];
        // Skip MEMORY.md updates (those aren't siblings).
        if (name.toLowerCase() !== 'memory') {
          siblingTargets.push(`${name}.md`);
        }
      }

      if (siblingTargets.length === 0) {
        return; // No sibling creations; nothing more to check.
      }

      // For each created sibling, the patch must contain a MEMORY.md
      // pointer line that uses the ABSOLUTE path. Bare basename references
      // are the bug we're guarding against.
      for (const sibling of siblingTargets) {
        const absolutePath = path.join(memoryDir, sibling);
        // Look for an added line referencing the sibling.
        const addedLines = patch
          .split('\n')
          .filter((line) => line.startsWith('+'));
        const referencingLines = addedLines.filter((line) =>
          line.includes(sibling),
        );
        expect(
          referencingLines.length,
          `Expected a MEMORY.md pointer for ${sibling} (auto-bundle would also add one).`,
        ).toBeGreaterThan(0);
        const allAbsolute = referencingLines.every((line) =>
          line.includes(absolutePath),
        );
        expect(
          allAbsolute,
          `Pointer for ${sibling} must use absolute path. Saw: ${referencingLines.join(' | ')}`,
        ).toBe(true);
      }
    },
  });

  componentEvalTest('USUALLY_PASSES', {
    suiteName: 'auto-memory-contract',
    suiteType: 'component-level',
    name: 'never writes to <projectRoot>/GEMINI.md even for team-shared facts',
    files: WORKSPACE_FILES,
    timeout: 240000,
    configOverrides: EXTRACTION_CONFIG_OVERRIDES,
    setup: async (config) => {
      // Sessions that talk about TEAM CONVENTIONS — the kind of content that
      // would be a perfect fit for <projectRoot>/GEMINI.md, but the prompt
      // forbids the extraction agent from touching it.
      await seedSessions(config, [
        {
          sessionId: 'team-convention-pnpm-1',
          summary: 'Team convention: always use pnpm not npm for installs',
          timestampOffsetMinutes: 420,
          userTurns: [
            'Important team-wide convention for this repo: always use pnpm for installs, never npm.',
            'This is a shared rule across all engineers on the project.',
            'It applies to every package install, every clean, every dependency add.',
            'The rationale is workspace hoisting; npm would break the monorepo layout.',
            'This is a durable team rule, committed to the repo conventions.',
            'Future agents working in this repo should ALWAYS use pnpm.',
            'It is the standard team practice, no exceptions.',
            'Document it as part of the project conventions.',
            'Treat it as a hard rule for the team.',
            'I want this captured for future sessions.',
          ],
        },
        {
          sessionId: 'team-convention-pnpm-2',
          summary: 'Reaffirming the pnpm-only team rule in another session',
          timestampOffsetMinutes: 360,
          userTurns: [
            'Reminder again: this team uses pnpm exclusively, never npm.',
            'Another agent tried npm install and broke the lockfile.',
            'The team rule is clear: pnpm only for any install operation.',
            'It is part of our shared conventions for this codebase.',
            'Make sure future agents follow this team-wide rule.',
            'It applies to all engineers, all CI runs, all dev environments.',
            'The convention is durable and well-established for this repo.',
            'Agents should read this rule from project conventions before installing.',
            'No future agent should ever invoke `npm install` in this repo.',
            'Always pnpm. Always.',
          ],
        },
      ]);
    },
    assert: async (config) => {
      await startMemoryService(config);
      const inbox = await snapshotInbox(config);
      const projectRoot = config.storage.getProjectRoot();

      // No private patch should target <projectRoot>/GEMINI.md or any
      // subdirectory GEMINI.md.
      const projectRootRegex = new RegExp(
        `\\+\\+\\+ ${projectRoot.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}.*GEMINI\\.md`,
      );
      for (const [name, content] of inbox.privateContents) {
        expect(
          projectRootRegex.test(content),
          `Private patch "${name}" must not target a GEMINI.md under <projectRoot>. Content:\n${content}`,
        ).toBe(false);
      }

      // Verify on disk: <projectRoot>/GEMINI.md was not created or modified
      // by the extraction agent (snapshot rollback should also enforce this,
      // but we double-check from the post-run state).
      const projectGemini = path.join(projectRoot, 'GEMINI.md');
      const exists = await fsp
        .access(projectGemini)
        .then(() => true)
        .catch(() => false);
      // The seeded workspace's WORKSPACE_FILES doesn't include GEMINI.md, so
      // it must NOT exist after the run.
      expect(
        exists,
        `<projectRoot>/GEMINI.md (${projectGemini}) must not be created by the extraction agent.`,
      ).toBe(false);
    },
  });
});
