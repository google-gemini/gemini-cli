/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import {
  evalTest,
  assertModelHasOutput,
  checkModelOutputContent,
} from './test-helper.js';

describe('save_memory', () => {
  const TEST_PREFIX = 'Save memory test: ';
  const rememberingFavoriteColor = "Agent remembers user's favorite color";
  evalTest('ALWAYS_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: rememberingFavoriteColor,

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
        experimental: { memoryManager: true },
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
      const wasToolCalled = await rig.waitForToolCall(
        'invoke_agent',
        undefined,
        (args) => /save_memory/i.test(args) && /vitest/i.test(args),
      );
      expect(
        wasToolCalled,
        'Expected invoke_agent to be called with save_memory agent and the Vitest preference from the conversation history',
      ).toBe(true);

      assertModelHasOutput(result);
    },
  });

  const memoryManagerRoutingPreferences =
    'Agent routes global and project preferences to memory';
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: memoryManagerRoutingPreferences,
    params: {
      settings: {
        experimental: { memoryManager: true },
      },
    },
    messages: [
      {
        id: 'msg-1',
        type: 'user',
        content: [
          {
            text: 'I always use dark mode in all my editors and terminals.',
          },
        ],
        timestamp: '2026-01-01T00:00:00Z',
      },
      {
        id: 'msg-2',
        type: 'gemini',
        content: [{ text: 'Got it, I will keep that in mind!' }],
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
      const wasToolCalled = await rig.waitForToolCall(
        'invoke_agent',
        undefined,
        (args) => /save_memory/i.test(args),
      );
      expect(
        wasToolCalled,
        'Expected invoke_agent to be called with save_memory agent',
      ).toBe(true);

      assertModelHasOutput(result);
    },
  });
});
