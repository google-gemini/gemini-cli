/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadConversationRecord,
  SESSION_FILE_PREFIX,
} from '@google/gemini-cli-core';
import {
  evalTest,
  assertModelHasOutput,
  checkModelOutputContent,
} from './test-helper.js';

function findDir(base: string, name: string): string | null {
  if (!fs.existsSync(base)) return null;
  const files = fs.readdirSync(base);
  for (const file of files) {
    const fullPath = path.join(base, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file === name) return fullPath;
      const found = findDir(fullPath, name);
      if (found) return found;
    }
  }
  return null;
}

async function loadLatestSessionRecord(homeDir: string, sessionId: string) {
  const chatsDir = findDir(path.join(homeDir, '.gemini'), 'chats');
  if (!chatsDir) {
    throw new Error('Could not find chats directory for eval session logs');
  }

  const candidates = fs
    .readdirSync(chatsDir)
    .filter(
      (file) =>
        file.startsWith(SESSION_FILE_PREFIX) &&
        (file.endsWith('.json') || file.endsWith('.jsonl')),
    );

  const matchingRecords = [];
  for (const file of candidates) {
    const filePath = path.join(chatsDir, file);
    const record = await loadConversationRecord(filePath);
    if (record?.sessionId === sessionId) {
      matchingRecords.push(record);
    }
  }

  matchingRecords.sort(
    (a, b) => Date.parse(b.lastUpdated) - Date.parse(a.lastUpdated),
  );
  return matchingRecords[0] ?? null;
}

async function waitForSessionScratchpad(
  homeDir: string,
  sessionId: string,
  timeoutMs = 30000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const record = await loadLatestSessionRecord(homeDir, sessionId);
    if (record?.memoryScratchpad) {
      return record;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return loadLatestSessionRecord(homeDir, sessionId);
}

describe('save_memory', () => {
  const TEST_PREFIX = 'Save memory test: ';
  const rememberingFavoriteColor = "Agent remembers user's favorite color";
  evalTest('ALWAYS_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: rememberingFavoriteColor,
    params: {
      settings: {
        experimental: { memoryV2: false },
      },
    },

    prompt: `remember that my favorite color is  blue.
  
    what is my favorite color? tell me that and surround it with $ symbol`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: 'blue',
        testName: `${TEST_PREFIX}${rememberingFavoriteColor}`,
      });
    },
  });
  const rememberingCommandRestrictions = 'Agent remembers command restrictions';
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: rememberingCommandRestrictions,
    params: {
      settings: {
        experimental: { memoryV2: false },
      },
    },

    prompt: `I don't want you to ever run npm commands.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: [/not run npm commands|remember|ok/i],
        testName: `${TEST_PREFIX}${rememberingCommandRestrictions}`,
      });
    },
  });

  const rememberingWorkflow = 'Agent remembers workflow preferences';
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: rememberingWorkflow,
    params: {
      settings: {
        experimental: { memoryV2: false },
      },
    },

    prompt: `I want you to always lint after building.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: [/always|ok|remember|will do/i],
        testName: `${TEST_PREFIX}${rememberingWorkflow}`,
      });
    },
  });

  const ignoringTemporaryInformation =
    'Agent ignores temporary conversation details';
  evalTest('ALWAYS_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: ignoringTemporaryInformation,
    params: {
      settings: {
        experimental: { memoryV2: false },
      },
    },

    prompt: `I'm going to get a coffee.`,
    assert: async (rig, result) => {
      await rig.waitForTelemetryReady();
      const wasToolCalled = rig
        .readToolLogs()
        .some((log) => log.toolRequest.name === 'save_memory');
      expect(
        wasToolCalled,
        'save_memory should not be called for temporary information',
      ).toBe(false);

      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        testName: `${TEST_PREFIX}${ignoringTemporaryInformation}`,
        forbiddenContent: [/remember|will do/i],
      });
    },
  });

  const rememberingPetName = "Agent remembers user's pet's name";
  evalTest('ALWAYS_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: rememberingPetName,
    params: {
      settings: {
        experimental: { memoryV2: false },
      },
    },

    prompt: `Please remember that my dog's name is Buddy.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: [/Buddy/i],
        testName: `${TEST_PREFIX}${rememberingPetName}`,
      });
    },
  });

  const rememberingCommandAlias = 'Agent remembers custom command aliases';
  evalTest('ALWAYS_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: rememberingCommandAlias,
    params: {
      settings: {
        experimental: { memoryV2: false },
      },
    },

    prompt: `When I say 'start server', you should run 'npm run dev'.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: [/npm run dev|start server|ok|remember|will do/i],
        testName: `${TEST_PREFIX}${rememberingCommandAlias}`,
      });
    },
  });

  const savingDbSchemaLocationAsProjectMemory =
    'Agent saves workspace database schema location as project memory';
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: savingDbSchemaLocationAsProjectMemory,
    params: {
      settings: {
        experimental: { memoryV2: false },
      },
    },
    prompt: `The database schema for this workspace is located in \`db/schema.sql\`.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall(
        'save_memory',
        undefined,
        (args) => {
          try {
            const params = JSON.parse(args);
            return params.scope === 'project';
          } catch {
            return false;
          }
        },
      );
      expect(
        wasToolCalled,
        'Expected save_memory to be called with scope="project" for workspace-specific information',
      ).toBe(true);

      assertModelHasOutput(result);
    },
  });

  const rememberingCodingStyle =
    "Agent remembers user's coding style preference";
  evalTest('ALWAYS_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: rememberingCodingStyle,
    params: {
      settings: {
        experimental: { memoryV2: false },
      },
    },

    prompt: `I prefer to use tabs instead of spaces for indentation.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: [/tabs instead of spaces|ok|remember|will do/i],
        testName: `${TEST_PREFIX}${rememberingCodingStyle}`,
      });
    },
  });

  const savingBuildArtifactLocationAsProjectMemory =
    'Agent saves workspace build artifact location as project memory';
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: savingBuildArtifactLocationAsProjectMemory,
    params: {
      settings: {
        experimental: { memoryV2: false },
      },
    },
    prompt: `In this workspace, build artifacts are stored in the \`dist/artifacts\` directory.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall(
        'save_memory',
        undefined,
        (args) => {
          try {
            const params = JSON.parse(args);
            return params.scope === 'project';
          } catch {
            return false;
          }
        },
      );
      expect(
        wasToolCalled,
        'Expected save_memory to be called with scope="project" for workspace-specific information',
      ).toBe(true);

      assertModelHasOutput(result);
    },
  });

  const savingMainEntryPointAsProjectMemory =
    'Agent saves workspace main entry point as project memory';
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: savingMainEntryPointAsProjectMemory,
    params: {
      settings: {
        experimental: { memoryV2: false },
      },
    },
    prompt: `The main entry point for this workspace is \`src/index.js\`.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall(
        'save_memory',
        undefined,
        (args) => {
          try {
            const params = JSON.parse(args);
            return params.scope === 'project';
          } catch {
            return false;
          }
        },
      );
      expect(
        wasToolCalled,
        'Expected save_memory to be called with scope="project" for workspace-specific information',
      ).toBe(true);

      assertModelHasOutput(result);
    },
  });

  const rememberingBirthday = "Agent remembers user's birthday";
  evalTest('ALWAYS_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: rememberingBirthday,
    params: {
      settings: {
        experimental: { memoryV2: false },
      },
    },

    prompt: `My birthday is on June 15th.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: [/June 15th|ok|remember|will do/i],
        testName: `${TEST_PREFIX}${rememberingBirthday}`,
      });
    },
  });

  const proactiveMemoryFromLongSession =
    'Agent saves preference from earlier in conversation history';
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: proactiveMemoryFromLongSession,
    params: {
      settings: {
        experimental: { memoryV2: true },
      },
    },
    messages: [
      {
        id: 'msg-1',
        type: 'user',
        content: [
          {
            text: 'By the way, I always prefer Vitest over Jest for testing in all my projects.',
          },
        ],
        timestamp: '2026-01-01T00:00:00Z',
      },
      {
        id: 'msg-2',
        type: 'gemini',
        content: [{ text: 'Noted! What are you working on today?' }],
        timestamp: '2026-01-01T00:00:05Z',
      },
      {
        id: 'msg-3',
        type: 'user',
        content: [
          {
            text: "I'm debugging a failing API endpoint. The /users route returns a 500 error.",
          },
        ],
        timestamp: '2026-01-01T00:01:00Z',
      },
      {
        id: 'msg-4',
        type: 'gemini',
        content: [
          {
            text: 'It looks like the database connection might not be initialized before the query runs.',
          },
        ],
        timestamp: '2026-01-01T00:01:10Z',
      },
      {
        id: 'msg-5',
        type: 'user',
        content: [
          { text: 'Good catch — I fixed the import and the route works now.' },
        ],
        timestamp: '2026-01-01T00:02:00Z',
      },
      {
        id: 'msg-6',
        type: 'gemini',
        content: [{ text: 'Great! Anything else you would like to work on?' }],
        timestamp: '2026-01-01T00:02:05Z',
      },
    ],
    prompt:
      'Please save any persistent preferences or facts about me from our conversation to memory.',
    assert: async (rig, result) => {
      // Under experimental.memoryV2, the agent persists memories by
      // editing markdown files directly with write_file or replace — not via
      // a save_memory subagent. The user said "I always prefer Vitest over
      // Jest for testing in all my projects" — that matches the new
      // cross-project cue phrase ("across all my projects"), so under the
      // 4-tier model the correct destination is the global personal memory
      // file (~/.gemini/GEMINI.md). It must NOT land in a committed project
      // GEMINI.md (that tier is for team conventions) or the per-project
      // private memory folder (that tier is for project-specific personal
      // notes). The chat history mixes this durable preference with
      // transient debugging chatter, so the eval also verifies the agent
      // picks out the persistent fact among the noise.
      await rig.waitForToolCall('write_file').catch(() => {});
      const writeCalls = rig
        .readToolLogs()
        .filter((log) =>
          ['write_file', 'replace'].includes(log.toolRequest.name),
        );

      const wroteVitestToGlobal = writeCalls.some((log) => {
        const args = log.toolRequest.args;
        return (
          /\.gemini\/GEMINI\.md/i.test(args) &&
          !/tmp\/[^/]+\/memory/i.test(args) &&
          /vitest/i.test(args)
        );
      });
      expect(
        wroteVitestToGlobal,
        'Expected the cross-project Vitest preference to be written to the global personal memory file (~/.gemini/GEMINI.md) via write_file or replace',
      ).toBe(true);

      const leakedToCommittedProject = writeCalls.some((log) => {
        const args = log.toolRequest.args;
        return (
          /GEMINI\.md/i.test(args) &&
          !/\.gemini\//i.test(args) &&
          /vitest/i.test(args)
        );
      });
      expect(
        leakedToCommittedProject,
        'Cross-project Vitest preference must NOT be mirrored into a committed project ./GEMINI.md (that tier is for team-shared conventions only)',
      ).toBe(false);

      const leakedToPrivateProject = writeCalls.some((log) => {
        const args = log.toolRequest.args;
        return (
          /\.gemini\/tmp\/[^/]+\/memory\//i.test(args) && /vitest/i.test(args)
        );
      });
      expect(
        leakedToPrivateProject,
        'Cross-project Vitest preference must NOT be mirrored into the private project memory folder (that tier is for project-specific personal notes only)',
      ).toBe(false);

      assertModelHasOutput(result);
    },
  });

  const memoryV2RoutesTeamConventionsToProjectGemini =
    'Agent routes team-shared project conventions to ./GEMINI.md';
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: memoryV2RoutesTeamConventionsToProjectGemini,
    params: {
      settings: {
        experimental: { memoryV2: true },
      },
    },
    messages: [
      {
        id: 'msg-1',
        type: 'user',
        content: [
          {
            text: 'For this project, the team always runs tests with `npm run test` — please remember that as our project convention.',
          },
        ],
        timestamp: '2026-01-01T00:00:00Z',
      },
      {
        id: 'msg-2',
        type: 'gemini',
        content: [
          { text: 'Got it, I will keep `npm run test` in mind for tests.' },
        ],
        timestamp: '2026-01-01T00:00:05Z',
      },
      {
        id: 'msg-3',
        type: 'user',
        content: [
          {
            text: 'For this project specifically, we use 2-space indentation.',
          },
        ],
        timestamp: '2026-01-01T00:01:00Z',
      },
      {
        id: 'msg-4',
        type: 'gemini',
        content: [
          { text: 'Understood, 2-space indentation for this project.' },
        ],
        timestamp: '2026-01-01T00:01:05Z',
      },
    ],
    prompt: 'Please save the preferences I mentioned earlier to memory.',
    assert: async (rig, result) => {
      // Under experimental.memoryV2, the prompt enforces an explicit
      // one-tier-per-fact rule: team-shared project conventions (the team's
      // test command, project-wide indentation rules) belong in the
      // committed project-root ./GEMINI.md and must NOT be mirrored or
      // cross-referenced into the private project memory folder
      // (~/.gemini/tmp/<hash>/memory/). The global ~/.gemini/GEMINI.md must
      // never be touched in this mode either.
      await rig.waitForToolCall('write_file').catch(() => {});
      const writeCalls = rig
        .readToolLogs()
        .filter((log) =>
          ['write_file', 'replace'].includes(log.toolRequest.name),
        );

      const wroteToProjectRoot = (factPattern: RegExp) =>
        writeCalls.some((log) => {
          const args = log.toolRequest.args;
          return (
            /GEMINI\.md/i.test(args) &&
            !/\.gemini\//i.test(args) &&
            factPattern.test(args)
          );
        });

      expect(
        wroteToProjectRoot(/npm run test/i),
        'Expected the team test-command convention to be written to the project-root ./GEMINI.md',
      ).toBe(true);

      expect(
        wroteToProjectRoot(/2[- ]space/i),
        'Expected the project-wide "2-space indentation" convention to be written to the project-root ./GEMINI.md',
      ).toBe(true);

      const leakedToPrivateMemory = writeCalls.some((log) => {
        const args = log.toolRequest.args;
        return (
          /\.gemini\/tmp\/[^/]+\/memory\//i.test(args) &&
          (/npm run test/i.test(args) || /2[- ]space/i.test(args))
        );
      });
      expect(
        leakedToPrivateMemory,
        'Team-shared project conventions must NOT be mirrored into the private project memory folder (~/.gemini/tmp/<hash>/memory/) — each fact lives in exactly one tier.',
      ).toBe(false);

      const leakedToGlobal = writeCalls.some((log) => {
        const args = log.toolRequest.args;
        return (
          /\.gemini\/GEMINI\.md/i.test(args) &&
          !/tmp\/[^/]+\/memory/i.test(args)
        );
      });
      expect(
        leakedToGlobal,
        'Project preferences must NOT be written to the global ~/.gemini/GEMINI.md',
      ).toBe(false);

      assertModelHasOutput(result);
    },
  });

  const memoryV2SessionScratchpad =
    'Session summary persists memory scratchpad for memory-saving sessions';
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: memoryV2SessionScratchpad,
    sessionId: 'memory-scratchpad-eval',
    params: {
      settings: {
        experimental: { memoryV2: true },
      },
    },
    messages: [
      {
        id: 'msg-1',
        type: 'user',
        content: [
          {
            text: 'Across all my projects, I prefer Vitest over Jest for testing.',
          },
        ],
        timestamp: '2026-01-01T00:00:00Z',
      },
      {
        id: 'msg-2',
        type: 'gemini',
        content: [{ text: 'Noted. What else should I keep in mind?' }],
        timestamp: '2026-01-01T00:00:05Z',
      },
      {
        id: 'msg-3',
        type: 'user',
        content: [
          {
            text: 'For this repo I was debugging a flaky API test earlier, but that was just transient context.',
          },
        ],
        timestamp: '2026-01-01T00:01:00Z',
      },
      {
        id: 'msg-4',
        type: 'gemini',
        content: [
          { text: 'Understood. I will only save the durable preference.' },
        ],
        timestamp: '2026-01-01T00:01:05Z',
      },
    ],
    prompt:
      'Please save any persistent preferences or facts about me from our conversation to memory.',
    assert: async (rig, result) => {
      await rig.waitForToolCall('write_file').catch(() => {});
      const writeCalls = rig
        .readToolLogs()
        .filter((log) =>
          ['write_file', 'replace'].includes(log.toolRequest.name),
        );

      expect(
        writeCalls.length,
        'Expected memoryV2 save flow to edit a markdown memory file',
      ).toBeGreaterThan(0);

      await rig.run({
        args: ['--list-sessions'],
        approvalMode: 'yolo',
        timeout: 120000,
      });

      const record = await waitForSessionScratchpad(
        rig.homeDir!,
        'memory-scratchpad-eval',
      );
      expect(
        record?.memoryScratchpad,
        'Expected the resumed session log to contain a memoryScratchpad after session summary generation',
      ).toBeDefined();
      expect(record?.memoryScratchpad?.version).toBe(1);
      expect(
        record?.memoryScratchpad?.toolSequence?.some((toolName) =>
          ['write_file', 'replace'].includes(toolName),
        ),
        'Expected memoryScratchpad.toolSequence to include the markdown editing tool used for memory persistence',
      ).toBe(true);
      expect(
        record?.memoryScratchpad?.touchedPaths?.length,
        'Expected memoryScratchpad to capture at least one touched path',
      ).toBeGreaterThan(0);
      expect(
        record?.memoryScratchpad?.workflowSummary,
        'Expected memoryScratchpad.workflowSummary to be populated',
      ).toMatch(/write_file|replace/i);

      assertModelHasOutput(result);
    },
  });

  const memoryV2RoutesUserProject =
    'Agent routes personal-to-user project notes to user-project memory';
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: memoryV2RoutesUserProject,
    params: {
      settings: {
        experimental: { memoryV2: true },
      },
    },
    prompt: `Please remember my personal local dev setup for THIS project's Postgres database. This is private to my machine — do NOT commit it to the repo.

Connection details:
- Host: localhost
- Port: 6543 (non-standard, I run multiple Postgres instances)
- Database: myproj_dev
- User: sandy_local
- Password: read from the SANDY_PG_LOCAL_PASS env var in my shell

How I start it locally:
1. Run \`brew services start postgresql@15\` to bring the server up.
2. Run \`./scripts/seed-local-db.sh\` from the repo root to load my personal seed data.
3. Verify with \`psql -h localhost -p 6543 -U sandy_local myproj_dev -c '\\dt'\`.

Quirks to remember:
- The migrations runner sometimes hangs on my machine if I forget step 1; kill it with Ctrl+C and rerun.
- I keep an extra \`scratch\` schema for ad-hoc experiments — never reference it from project code.`,
    assert: async (rig, result) => {
      // Under experimental.memoryV2 with the Private Project Memory bullet
      // surfaced in the prompt, a fact that is project-specific AND
      // personal-to-the-user (must not be committed) should land in the
      // private project memory folder under ~/.gemini/tmp/<hash>/memory/. The
      // detailed note should be written to a sibling markdown file, with
      // MEMORY.md updated as the index. It must NOT go to committed
      // ./GEMINI.md or the global ~/.gemini/GEMINI.md.
      await rig.waitForToolCall('write_file').catch(() => {});
      const writeCalls = rig
        .readToolLogs()
        .filter((log) =>
          ['write_file', 'replace'].includes(log.toolRequest.name),
        );

      const wroteUserProjectDetail = writeCalls.some((log) => {
        const args = log.toolRequest.args;
        return (
          /\.gemini\/tmp\/[^/]+\/memory\/(?!MEMORY\.md)[^"]+\.md/i.test(args) &&
          /6543/.test(args)
        );
      });
      expect(
        wroteUserProjectDetail,
        'Expected the personal-to-user project note to be written to a private project memory detail file (~/.gemini/tmp/<hash>/memory/*.md)',
      ).toBe(true);

      const wroteUserProjectIndex = writeCalls.some((log) => {
        const args = log.toolRequest.args;
        return /\.gemini\/tmp\/[^/]+\/memory\/MEMORY\.md/i.test(args);
      });
      expect(
        wroteUserProjectIndex,
        'Expected the personal-to-user project note to update the private project memory index (~/.gemini/tmp/<hash>/memory/MEMORY.md)',
      ).toBe(true);

      // Defensive: should NOT have written this private note to the
      // committed project GEMINI.md or the global GEMINI.md.
      const leakedToCommittedProject = writeCalls.some((log) => {
        const args = log.toolRequest.args;
        return (
          /\/GEMINI\.md/i.test(args) &&
          !/\.gemini\//i.test(args) &&
          /6543/.test(args)
        );
      });
      expect(
        leakedToCommittedProject,
        'Personal-to-user note must NOT be written to the committed project GEMINI.md',
      ).toBe(false);

      const leakedToGlobal = writeCalls.some((log) => {
        const args = log.toolRequest.args;
        return (
          /\.gemini\/GEMINI\.md/i.test(args) &&
          !/tmp\/[^/]+\/memory/i.test(args) &&
          /6543/.test(args)
        );
      });
      expect(
        leakedToGlobal,
        'Personal-to-user project note must NOT be written to the global ~/.gemini/GEMINI.md',
      ).toBe(false);

      assertModelHasOutput(result);
    },
  });

  const memoryV2RoutesCrossProjectToGlobal =
    'Agent routes cross-project personal preferences to ~/.gemini/GEMINI.md';
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: memoryV2RoutesCrossProjectToGlobal,
    params: {
      settings: {
        experimental: { memoryV2: true },
      },
    },
    prompt:
      'Please remember this about me in general: across all my projects I always prefer Prettier with single quotes and trailing commas, and I always prefer tabs over spaces for indentation. These are my personal coding-style defaults that follow me into every workspace.',
    assert: async (rig, result) => {
      // Under experimental.memoryV2 with the Global Personal Memory
      // tier surfaced in the prompt, a fact that explicitly applies to the
      // user "across all my projects" / "in every workspace" must land in
      // the global ~/.gemini/GEMINI.md (the cross-project tier). It must
      // NOT be mirrored into a committed project-root ./GEMINI.md (that
      // tier is for team-shared conventions) or into the per-project
      // private memory folder (that tier is for project-specific personal
      // notes). Each fact lives in exactly one tier across all four tiers.
      await rig.waitForToolCall('write_file').catch(() => {});
      const writeCalls = rig
        .readToolLogs()
        .filter((log) =>
          ['write_file', 'replace'].includes(log.toolRequest.name),
        );

      const wroteToGlobal = (factPattern: RegExp) =>
        writeCalls.some((log) => {
          const args = log.toolRequest.args;
          return (
            /\.gemini\/GEMINI\.md/i.test(args) &&
            !/tmp\/[^/]+\/memory/i.test(args) &&
            factPattern.test(args)
          );
        });

      expect(
        wroteToGlobal(/Prettier/i),
        'Expected the cross-project Prettier preference to be written to the global personal memory file (~/.gemini/GEMINI.md)',
      ).toBe(true);

      expect(
        wroteToGlobal(/tabs/i),
        'Expected the cross-project "tabs over spaces" preference to be written to the global personal memory file (~/.gemini/GEMINI.md)',
      ).toBe(true);

      const leakedToCommittedProject = writeCalls.some((log) => {
        const args = log.toolRequest.args;
        return (
          /GEMINI\.md/i.test(args) &&
          !/\.gemini\//i.test(args) &&
          (/Prettier/i.test(args) || /tabs/i.test(args))
        );
      });
      expect(
        leakedToCommittedProject,
        'Cross-project personal preferences must NOT be mirrored into a committed project ./GEMINI.md (that tier is for team-shared conventions only)',
      ).toBe(false);

      const leakedToPrivateProject = writeCalls.some((log) => {
        const args = log.toolRequest.args;
        return (
          /\.gemini\/tmp\/[^/]+\/memory\//i.test(args) &&
          (/Prettier/i.test(args) || /tabs/i.test(args))
        );
      });
      expect(
        leakedToPrivateProject,
        'Cross-project personal preferences must NOT be mirrored into the private project memory folder (that tier is for project-specific personal notes only)',
      ).toBe(false);

      assertModelHasOutput(result);
    },
  });
});
