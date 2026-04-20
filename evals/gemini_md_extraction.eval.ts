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
  listInboxPatches,
  normalizePath,
  refreshServerHierarchicalMemory,
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

const PACKAGE_JSON = JSON.stringify(
  {
    name: 'gemini-md-extraction-eval',
    private: true,
    scripts: {
      build: 'echo build',
      lint: 'echo lint',
      test: 'echo test',
      preflight: 'echo preflight',
    },
  },
  null,
  2,
);

/**
 * A baseline GEMINI.md that establishes the project as a real one with some
 * existing rules. Tests that expect a patch verify the agent ADDS a new rule
 * not already present here. Tests that expect NO patch include the candidate
 * rule already, exercising the "do not duplicate" gate.
 */
const BASELINE_GEMINI_MD = `# Project Conventions

## Build

- Run \`npm run build\` to compile the project.

## Linting

- Run \`npm run lint\` to lint the project.
`;

const GEMINI_MD_WITH_PREFLIGHT_RULE = `${BASELINE_GEMINI_MD}
## Preflight

- Always run \`npm run preflight\` before opening a PR.
`;

function workspaceFiles(geminiMdContent: string): Record<string, string> {
  return {
    'package.json': PACKAGE_JSON,
    'README.md': '# GEMINI.md Extraction Eval\n',
    'GEMINI.md': geminiMdContent,
  };
}

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

/**
 * Refreshes hierarchical memory so the workspace `GEMINI.md` is loaded into
 * `config.getGeminiMdFilePaths()`. Without this, the extraction agent has no
 * targeting context and the GEMINI.md patching capability is inert.
 */
async function loadGeminiMdContext(config: Config): Promise<void> {
  await refreshServerHierarchicalMemory(config);
}

/**
 * Returns the comparison key for the workspace GEMINI.md, in the form the
 * agent emits in patch diff headers. We use `normalizePath` (which lowercases
 * on darwin and Windows and uses forward slashes) so the comparison is robust
 * across platforms and against macOS's `/var/folders` -> `/private/var/folders`
 * symlink resolution. Patch entries are compared via `normalizePath` too.
 */
async function workspaceGeminiMdPath(config: Config): Promise<string> {
  const projectRoot = await fsp.realpath(config.storage.getProjectRoot());
  return normalizePath(path.join(projectRoot, 'GEMINI.md'));
}

const EXTRACTION_CONFIG_OVERRIDES = {
  experimentalAutoMemory: true,
  approvalMode: ApprovalMode.YOLO,
};

describe('GEMINI.md Extraction', () => {
  componentEvalTest('USUALLY_PASSES', {
    suiteName: 'gemini-md-extraction',
    suiteType: 'component-level',
    name: 'patches workspace GEMINI.md when a project rule recurs across sessions',
    files: workspaceFiles(BASELINE_GEMINI_MD),
    timeout: 180000,
    configOverrides: EXTRACTION_CONFIG_OVERRIDES,
    setup: async (config) => {
      await loadGeminiMdContext(config);
      await seedSessions(config, [
        {
          sessionId: 'preflight-correction-1',
          summary: 'User corrects agent on preflight before pushing',
          timestampOffsetMinutes: 420,
          userTurns: [
            'Stop. Before opening any PR in this project you must run npm run preflight first.',
            'I keep telling you this — npm run preflight is mandatory before pushing any branch.',
            'Yes, npm run preflight again. It runs clean, install, build, lint, typecheck, and tests.',
            'Please remember: npm run preflight before every PR in this repo, no exceptions.',
            'The project has its own preflight command for a reason; do not skip it.',
            'Confirmed: npm run preflight finished and the branch is ready to push.',
            'This is a standing project rule, not a one-off — apply it every time.',
            'After preflight passes, then we open the PR.',
            'I should not have to repeat npm run preflight every session.',
            'Acknowledged that npm run preflight is the required pre-PR step.',
          ],
        },
        {
          sessionId: 'preflight-correction-2',
          summary: 'User corrects agent again about preflight before PR',
          timestampOffsetMinutes: 360,
          userTurns: [
            'You forgot the preflight again — run npm run preflight before this PR too.',
            'I have said this multiple times: npm run preflight is mandatory in this project.',
            'It is the standard pre-PR check that catches lint, type, and test regressions.',
            'Please make this part of your default workflow for this repo.',
            'Yes, run npm run preflight now and then open the PR after it passes.',
            'This is a recurring project workflow, not specific to one branch.',
            'The preflight script exists exactly so we never push broken code.',
            'Confirmed: npm run preflight passed and the PR is ready.',
            'Future sessions in this project should also run npm run preflight before any PR.',
            'Treat npm run preflight as a hard requirement before every PR in this repo.',
          ],
        },
      ]);
    },
    assert: async (config) => {
      await startMemoryService(config);
      const inboxPatches = await listInboxPatches(config);

      // Expect at least one patch in the inbox.
      expect(inboxPatches.length).toBeGreaterThanOrEqual(1);

      // At least one patch should target the workspace GEMINI.md and add a
      // preflight rule. We check the diff content directly because the
      // filename is agent-chosen.
      const workspaceGeminiMd = await workspaceGeminiMdPath(config);
      const matchingPatch = inboxPatches.find((patch) =>
        patch.entries.some(
          (entry) =>
            normalizePath(entry.targetPath) === workspaceGeminiMd &&
            /preflight/i.test(entry.diffContent),
        ),
      );

      expect(
        matchingPatch,
        `Expected a patch targeting ${workspaceGeminiMd} with a preflight rule. ` +
          `Got patches: ${JSON.stringify(
            inboxPatches.map((p) => ({
              file: p.fileName,
              targets: p.entries.map((e) => e.targetPath),
            })),
            null,
            2,
          )}`,
      ).toBeDefined();
    },
  });

  componentEvalTest('USUALLY_PASSES', {
    suiteName: 'gemini-md-extraction',
    suiteType: 'component-level',
    name: 'does not patch GEMINI.md when the rule is already present',
    files: workspaceFiles(GEMINI_MD_WITH_PREFLIGHT_RULE),
    timeout: 180000,
    configOverrides: EXTRACTION_CONFIG_OVERRIDES,
    setup: async (config) => {
      await loadGeminiMdContext(config);
      // Same recurring preflight signal as the positive case — but the
      // workspace GEMINI.md ALREADY documents the rule, so the agent must not
      // propose a duplicate patch.
      await seedSessions(config, [
        {
          sessionId: 'preflight-already-documented-1',
          summary: 'User reminds agent about preflight',
          timestampOffsetMinutes: 420,
          userTurns: [
            'Run npm run preflight before opening this PR.',
            'You should always run npm run preflight before pushing in this project.',
            'Preflight runs clean, install, build, lint, typecheck, and tests.',
            'Confirmed: npm run preflight finished, ready to push.',
            'This is the standard pre-PR check we use here.',
            'Please apply this every time in this repo.',
            'Yes, npm run preflight again.',
            'It is the documented project workflow.',
            'After it passes we open the PR.',
            'Acknowledged: npm run preflight is the pre-PR step.',
          ],
        },
        {
          sessionId: 'preflight-already-documented-2',
          summary: 'User reminds agent about preflight again',
          timestampOffsetMinutes: 360,
          userTurns: [
            'Same drill: run npm run preflight before opening this PR too.',
            'It catches lint, type, and test regressions before review.',
            'It is the project standard for every PR in this repo.',
            'Confirmed: npm run preflight passed, PR is ready.',
            'Use it every time in this project.',
            'No exceptions.',
            'Run npm run preflight now.',
            'Then open the PR.',
            'Done.',
            'Standard project workflow.',
          ],
        },
      ]);
    },
    assert: async (config) => {
      await startMemoryService(config);
      const inboxPatches = await listInboxPatches(config);

      const workspaceGeminiMd = await workspaceGeminiMdPath(config);

      // The agent may legitimately produce no patches at all, OR it may
      // produce a skill patch — but it must NOT produce a GEMINI.md patch
      // that just restates the preflight rule that's already there.
      const duplicatePatch = inboxPatches.find((patch) =>
        patch.entries.some(
          (entry) =>
            normalizePath(entry.targetPath) === workspaceGeminiMd &&
            /preflight/i.test(entry.diffContent),
        ),
      );

      expect(
        duplicatePatch,
        `Expected NO GEMINI.md preflight patch (rule already present). ` +
          `Got: ${JSON.stringify(
            inboxPatches.map((p) => ({
              file: p.fileName,
              targets: p.entries.map((e) => e.targetPath),
            })),
            null,
            2,
          )}`,
      ).toBeUndefined();
    },
  });

  componentEvalTest('USUALLY_PASSES', {
    suiteName: 'gemini-md-extraction',
    suiteType: 'component-level',
    name: 'does not propose GEMINI.md patches from a single one-off correction',
    files: workspaceFiles(BASELINE_GEMINI_MD),
    timeout: 180000,
    configOverrides: EXTRACTION_CONFIG_OVERRIDES,
    setup: async (config) => {
      await loadGeminiMdContext(config);
      // Two sessions, but they describe a one-off branch-specific incident
      // tied to a specific ticket and date — not a durable project rule. The
      // agent should NOT promote this to a GEMINI.md patch.
      await seedSessions(config, [
        {
          sessionId: 'one-off-incident-1',
          summary: 'Debug staging cookie issue for INC-7733',
          timestampOffsetMinutes: 420,
          userTurns: [
            'For incident INC-7733 only, clear the staging cookie before retrying the login.',
            'This workaround is just for the 2026-04-12 staging rollout.',
            'Do not generalize this — it is incident-specific to INC-7733.',
            'The branch hotfix/inc-7733 needs this exact one-off cookie clear.',
            'After the cookie clear, the login worked again for this incident.',
            'This is not a recurring project workflow.',
            'Do not turn this into a documented rule.',
            'It only applies to this one staging rollout.',
            'Confirmed: INC-7733 is resolved with the one-off cookie clear.',
            'Close out INC-7733; we do not need to remember this.',
          ],
        },
        {
          sessionId: 'one-off-incident-2',
          summary: 'Follow-up cleanup for INC-7733',
          timestampOffsetMinutes: 360,
          userTurns: [
            'INC-7733 follow-up: just remove the temporary cookie-clear branch.',
            'This is incident cleanup, not a workflow.',
            'No documentation changes needed for INC-7733.',
            'It was a one-time staging issue tied to that specific rollout.',
            'Confirmed: hotfix branch deleted.',
            'Do not record this as a project convention.',
            'It is not a reusable procedure.',
            'INC-7733 is fully closed.',
            'No durable rule to add to GEMINI.md.',
            'This is purely incident response.',
          ],
        },
      ]);
    },
    assert: async (config) => {
      await startMemoryService(config);
      const inboxPatches = await listInboxPatches(config);

      const workspaceGeminiMd = await workspaceGeminiMdPath(config);

      const incidentPatch = inboxPatches.find((patch) =>
        patch.entries.some(
          (entry) =>
            normalizePath(entry.targetPath) === workspaceGeminiMd &&
            /(INC-7733|cookie|staging)/i.test(entry.diffContent),
        ),
      );

      expect(
        incidentPatch,
        `Expected NO GEMINI.md patch for one-off incident INC-7733. ` +
          `Got: ${JSON.stringify(
            inboxPatches.map((p) => ({
              file: p.fileName,
              targets: p.entries.map((e) => e.targetPath),
            })),
            null,
            2,
          )}`,
      ).toBeUndefined();
    },
  });
});
