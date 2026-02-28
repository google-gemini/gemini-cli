/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import {
  assertModelHasOutput,
  checkModelOutputContent,
} from '../integration-tests/test-helper.js';

describe('save_memory', () => {
  const TEST_PREFIX = 'Save memory test: ';
  const rememberingFavoriteColor = "Agent remembers user's favorite color";
  evalTest('USUALLY_PASSES', {
    name: rememberingFavoriteColor,
    params: {
      settings: { tools: { core: ['save_memory'] } },
    },
    prompt: `remember that my favorite color is  blue.
  
    what is my favorite color? tell me that and surround it with $ symbol`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      assertModelHasOutput(result);
      expect(
        checkModelOutputContent(result, {
          expectedContent: 'blue',
          testName: `${TEST_PREFIX}${rememberingFavoriteColor}`,
        }),
        'Model output content check failed for favorite color',
      ).toBe(true);
    },
  });
  const rememberingCommandRestrictions = 'Agent remembers command restrictions';
  evalTest('USUALLY_PASSES', {
    name: rememberingCommandRestrictions,
    params: {
      settings: { tools: { core: ['save_memory'] } },
    },
    prompt: `I don't want you to ever run npm commands.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      assertModelHasOutput(result);
      expect(
        checkModelOutputContent(result, {
          expectedContent: [/not run npm commands|remember|ok/i],
          testName: `${TEST_PREFIX}${rememberingCommandRestrictions}`,
        }),
        'Model output content check failed for command restrictions',
      ).toBe(true);
    },
  });

  const rememberingWorkflow = 'Agent remembers workflow preferences';
  evalTest('USUALLY_PASSES', {
    name: rememberingWorkflow,
    params: {
      settings: { tools: { core: ['save_memory'] } },
    },
    prompt: `I want you to always lint after building.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      assertModelHasOutput(result);
      expect(
        checkModelOutputContent(result, {
          expectedContent: [/always|ok|remember|will do/i],
          testName: `${TEST_PREFIX}${rememberingWorkflow}`,
        }),
        'Model output content check failed for workflow preferences',
      ).toBe(true);
    },
  });

  const ignoringTemporaryInformation =
    'Agent ignores temporary conversation details';
  evalTest('USUALLY_PASSES', {
    name: ignoringTemporaryInformation,
    params: {
      settings: { tools: { core: ['save_memory'] } },
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
      expect(
        checkModelOutputContent(result, {
          testName: `${TEST_PREFIX}${ignoringTemporaryInformation}`,
          forbiddenContent: [/remember|will do/i],
        }),
        'Model output content check failed for ignoring temporary info',
      ).toBe(true);
    },
  });

  const rememberingPetName = "Agent remembers user's pet's name";
  evalTest('USUALLY_PASSES', {
    name: rememberingPetName,
    params: {
      settings: { tools: { core: ['save_memory'] } },
    },
    prompt: `Please remember that my dog's name is Buddy.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      assertModelHasOutput(result);
      expect(
        checkModelOutputContent(result, {
          expectedContent: [/Buddy/i],
          testName: `${TEST_PREFIX}${rememberingPetName}`,
        }),
        'Model output content check failed for pet name',
      ).toBe(true);
    },
  });

  const rememberingCommandAlias = 'Agent remembers custom command aliases';
  evalTest('USUALLY_PASSES', {
    name: rememberingCommandAlias,
    params: {
      settings: { tools: { core: ['save_memory'] } },
    },
    prompt: `When I say 'start server', you should run 'npm run dev'.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      assertModelHasOutput(result);
      expect(
        checkModelOutputContent(result, {
          expectedContent: [/npm run dev|start server|ok|remember|will do/i],
          testName: `${TEST_PREFIX}${rememberingCommandAlias}`,
        }),
        'Model output content check failed for command alias',
      ).toBe(true);
    },
  });

  const ignoringDbSchemaLocation =
    "Agent ignores workspace's database schema location";
  evalTest('USUALLY_PASSES', {
    name: ignoringDbSchemaLocation,
    params: {
      settings: {
        tools: {
          core: [
            'save_memory',
            'list_directory',
            'read_file',
            'run_shell_command',
          ],
        },
      },
    },
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
  evalTest('USUALLY_PASSES', {
    name: rememberingCodingStyle,
    params: {
      settings: { tools: { core: ['save_memory'] } },
    },
    prompt: `I prefer to use tabs instead of spaces for indentation.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      assertModelHasOutput(result);
      expect(
        checkModelOutputContent(result, {
          expectedContent: [/tabs instead of spaces|ok|remember|will do/i],
          testName: `${TEST_PREFIX}${rememberingCodingStyle}`,
        }),
        'Model output content check failed for coding style',
      ).toBe(true);
    },
  });

  const ignoringBuildArtifactLocation =
    'Agent ignores workspace build artifact location';
  evalTest('USUALLY_PASSES', {
    name: ignoringBuildArtifactLocation,
    params: {
      settings: {
        tools: {
          core: [
            'save_memory',
            'list_directory',
            'read_file',
            'run_shell_command',
          ],
        },
      },
    },
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
    params: {
      settings: {
        tools: {
          core: [
            'save_memory',
            'list_directory',
            'read_file',
            'run_shell_command',
          ],
        },
      },
    },
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
  evalTest('USUALLY_PASSES', {
    name: rememberingBirthday,
    params: {
      settings: { tools: { core: ['save_memory'] } },
    },
    prompt: `My birthday is on June 15th.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      assertModelHasOutput(result);
      expect(
        checkModelOutputContent(result, {
          expectedContent: [/June 15th|ok|remember|will do/i],
          testName: `${TEST_PREFIX}${rememberingBirthday}`,
        }),
        'Model output content check failed for birthday',
      ).toBe(true);
    },
  });
});
