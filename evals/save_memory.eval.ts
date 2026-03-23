/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import { appEvalTest } from './app-test-helper.js';
import {
  assertModelHasOutput,
  checkModelOutputContent,
} from '../integration-tests/test-helper.js';

describe('save_memory', () => {
  const TEST_PREFIX = 'Save memory test: ';
  const rememberingFavoriteColor = "Agent remembers user's favorite color";
  evalTest('ALWAYS_PASSES', {
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

  const ignoringDbSchemaLocation =
    "Agent ignores workspace's database schema location";
  evalTest('USUALLY_PASSES', {
    name: ignoringDbSchemaLocation,
    prompt: `The database schema for this workspace is located in \`db/schema.sql\`.`,
    assert: async (rig, result) => {
      await rig.waitForTelemetryReady();
      const wasToolCalled = rig
        .readToolLogs()
        .some((log) => log.toolRequest.name === 'save_memory');
      expect(
        wasToolCalled,
        'save_memory should not be called for workspace-specific information',
      ).toBe(false);

      assertModelHasOutput(result);
    },
  });

  const rememberingCodingStyle =
    "Agent remembers user's coding style preference";
  evalTest('ALWAYS_PASSES', {
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

  const ignoringBuildArtifactLocation =
    'Agent ignores workspace build artifact location';
  evalTest('USUALLY_PASSES', {
    name: ignoringBuildArtifactLocation,
    prompt: `In this workspace, build artifacts are stored in the \`dist/artifacts\` directory.`,
    assert: async (rig, result) => {
      await rig.waitForTelemetryReady();
      const wasToolCalled = rig
        .readToolLogs()
        .some((log) => log.toolRequest.name === 'save_memory');
      expect(
        wasToolCalled,
        'save_memory should not be called for workspace-specific information',
      ).toBe(false);

      assertModelHasOutput(result);
    },
  });

  const ignoringMainEntryPoint = "Agent ignores workspace's main entry point";
  evalTest('USUALLY_PASSES', {
    name: ignoringMainEntryPoint,
    prompt: `The main entry point for this workspace is \`src/index.js\`.`,
    assert: async (rig, result) => {
      await rig.waitForTelemetryReady();
      const wasToolCalled = rig
        .readToolLogs()
        .some((log) => log.toolRequest.name === 'save_memory');
      expect(
        wasToolCalled,
        'save_memory should not be called for workspace-specific information',
      ).toBe(false);

      assertModelHasOutput(result);
    },
  });

  const rememberingBirthday = "Agent remembers user's birthday";
  evalTest('ALWAYS_PASSES', {
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
    'Agent proactively saves preference mentioned in multi-turn session';
  appEvalTest('USUALLY_PASSES', {
    name: proactiveMemoryFromLongSession,
    configOverrides: {
      experimental: { memoryManager: true },
    },
    files: {
      'src/index.ts': 'export const VERSION = "1.0.0";\n',
      'README.md': '# Test Project\nA sample project.\n',
    },
    setup: async (rig) => {
      rig.setBreakpoint('save_memory');
    },
    prompt:
      'By the way, I always prefer Vitest over Jest for testing in all my projects. Please just acknowledge.',
    timeout: 120000,
    assert: async (rig) => {
      // Agent should proactively call save_memory for the stated preference.
      const confirmation = await rig.waitForPendingConfirmation(
        'save_memory',
        60000,
      );
      expect(
        confirmation,
        'Expected save_memory to be proactively triggered for the Vitest preference',
      ).toBeTruthy();

      // Let the memory manager subagent run.
      await rig.resolveTool(confirmation);
      await rig.waitForIdle(60000);

      // Send follow-up messages to verify this was a multi-turn capable session.
      await rig.sendMessage(
        'Read the file src/index.ts and tell me the version.',
      );
      await rig.waitForIdle(60000);
    },
  });

  const memoryManagerRoutingPreferences =
    'Agent routes global and project preferences via save_memory in multi-turn session';
  appEvalTest('USUALLY_PASSES', {
    name: memoryManagerRoutingPreferences,
    configOverrides: {
      experimental: { memoryManager: true },
    },
    files: {
      'src/app.ts': 'console.log("hello world");\n',
      'package.json': '{ "name": "test-project", "version": "1.0.0" }\n',
    },
    setup: async (rig) => {
      rig.setBreakpoint('save_memory');
    },
    prompt:
      'I always use dark mode in all my editors and terminals. Please just acknowledge.',
    timeout: 180000,
    assert: async (rig) => {
      // Agent should proactively call save_memory for the global preference.
      const firstConfirmation = await rig.waitForPendingConfirmation(
        'save_memory',
        60000,
      );
      expect(
        firstConfirmation,
        'Expected save_memory to be called for the dark mode preference',
      ).toBeTruthy();
      await rig.resolveTool(firstConfirmation);
      await rig.waitForIdle(60000);

      // Turn 2: Filler task.
      await rig.sendMessage(
        'Read the file src/app.ts and tell me what it does.',
      );
      await rig.waitForIdle(60000);

      // Turn 3: State a project-specific preference.
      rig.setBreakpoint('save_memory');
      await rig.sendMessage(
        'For this project specifically, we use 2-space indentation. Please just acknowledge.',
      );

      // Agent should proactively call save_memory for the project preference.
      const secondConfirmation = await rig.waitForPendingConfirmation(
        'save_memory',
        60000,
      );
      expect(
        secondConfirmation,
        'Expected save_memory to be called for the indentation preference',
      ).toBeTruthy();
      await rig.resolveTool(secondConfirmation);
      await rig.waitForIdle(60000);
    },
  });
});
