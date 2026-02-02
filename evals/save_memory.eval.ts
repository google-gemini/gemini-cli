/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import { validateModelOutput } from '../integration-tests/test-helper.js';

describe('save_memory', () => {
  const TEST_PREFIX = 'Save memory test: ';
  const testName = 'Remembering Personal Details - Favorite Color';
  evalTest('ALWAYS_PASSES', {
    name: testName,
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

      validateModelOutput(result, {
        expectedContent: 'blue',
        testName: `${TEST_PREFIX}${testName}`,
      });
    },
  });
  const testName2 = 'Remembering User Preferences - Command Restrictions';
  evalTest('ALWAYS_PASSES', {
    name: testName2,
    params: {
      settings: { tools: { core: ['save_memory'] } },
    },
    prompt: `I don't want you to ever run npm commands.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      validateModelOutput(result, {
        expectedContent: [/not run npm commands|remember|ok/i],
        testName: `${TEST_PREFIX}${testName2}`,
      });
    },
  });

  const testName4 = 'Remembering User Preferences - Workflow';
  evalTest('ALWAYS_PASSES', {
    name: testName4,
    params: {
      settings: { tools: { core: ['save_memory'] } },
    },
    prompt: `I want you to always lint after building.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      validateModelOutput(result, {
        expectedContent: [/always|ok|remember|will do/i],
        testName: `${TEST_PREFIX}${testName4}`,
      });
    },
  });

  const testName5 = 'Behavioral Checks - Ignoring Temporary Information';
  evalTest('ALWAYS_PASSES', {
    name: testName5,
    params: {
      settings: { tools: { core: ['save_memory'] } },
    },
    prompt: `I'm going to get a coffee.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory', 500);
      if (wasToolCalled) {
        console.log(
          `[${testName5}] INFO: save_memory was called unexpectedly.`,
        );
      }

      validateModelOutput(result, {
        testName: `${TEST_PREFIX}${testName5}`,
        forbiddenContent: [/remember|will do/i],
      });
    },
  });

  const testName6 = 'Remembering Personal Details - Pet Name';
  evalTest('ALWAYS_PASSES', {
    name: testName6,
    params: {
      settings: { tools: { core: ['save_memory'] } },
    },
    prompt: `My dog's name is Buddy. What is my dog's name?`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      validateModelOutput(result, {
        expectedContent: [/Buddy/i],
        testName: `${TEST_PREFIX}${testName6}`,
      });
    },
  });

  const testName7 = 'Remembering User Preferences - Command Alias';
  evalTest('ALWAYS_PASSES', {
    name: testName7,
    params: {
      settings: { tools: { core: ['save_memory'] } },
    },
    prompt: `When I say 'start server', you should run 'npm run dev'.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      validateModelOutput(result, {
        expectedContent: [/npm run dev|start server|ok|remember|will do/i],
        testName: `${TEST_PREFIX}${testName7}`,
      });
    },
  });

  const testName8 = 'Remembering Project Details - Database Schema Location';
  evalTest('ALWAYS_PASSES', {
    name: testName8,
    params: {
      settings: { tools: { core: ['save_memory'] } },
    },
    prompt: `The database schema for this project is located in \`db/schema.sql\`.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      validateModelOutput(result, {
        expectedContent: [/database schema|ok|remember|will do/i],
        testName: `${TEST_PREFIX}${testName8}`,
      });
    },
  });

  const testName9 = 'Remembering User Preferences - Coding Style';
  evalTest('ALWAYS_PASSES', {
    name: testName9,
    params: {
      settings: { tools: { core: ['save_memory'] } },
    },
    prompt: `I prefer to use tabs instead of spaces for indentation.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      validateModelOutput(result, {
        expectedContent: [/tabs instead of spaces|ok|remember|will do/i],
        testName: `${TEST_PREFIX}${testName9}`,
      });
    },
  });

  const testName10 = 'Remembering User Preferences - Test Command';
  evalTest('ALWAYS_PASSES', {
    name: testName10,
    params: {
      settings: { tools: { core: ['save_memory'] } },
    },
    prompt: `The command to run all backend tests is \`npm run test:backend\`.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      validateModelOutput(result, {
        expectedContent: [
          /command to run all backend tests|ok|remember|will do/i,
        ],
        testName: `${TEST_PREFIX}${testName10}`,
      });
    },
  });

  const testName11 = 'Remembering Project Details - Main Entry Point';
  evalTest('ALWAYS_PASSES', {
    name: testName11,
    params: {
      settings: { tools: { core: ['save_memory'] } },
    },
    prompt: `The main entry point for this project is \`src/index.js\`.`,
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory tool to be called').toBe(
        true,
      );

      validateModelOutput(result, {
        expectedContent: [
          /main entry point for this project|ok|remember|will do/i,
        ],
        testName: `${TEST_PREFIX}${testName11}`,
      });
    },
  });
});
