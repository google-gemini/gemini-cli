/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import {
  assertModelHasOutput,
  checkModelOutputContent,
} from '../integration-tests/test-helper.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Behavioral evals for the experimental Memory Manager Agent.
 *
 * These test the subagent that replaces the built-in save_memory tool when
 * `experimental.memoryManager` is enabled. The subagent supports richer
 * operations — adding, removing, de-duplicating, and organizing — across
 * both global (~/.gemini/GEMINI.md) and project-level (./GEMINI.md) files.
 */
describe('memory_manager', () => {
  const MEMORY_MANAGER_SETTINGS = {
    experimental: { memoryManager: true },
    tools: { core: ['save_memory'] },
  };

  const TEST_PREFIX = 'Memory manager test: ';

  // ---------------------------------------------------------------------------
  // Basic save — global routing with file verification
  // ---------------------------------------------------------------------------
  const savesGlobalPreference =
    'saves a user preference to global GEMINI.md via subagent';
  evalTest('USUALLY_PASSES', {
    name: savesGlobalPreference,
    params: {
      settings: MEMORY_MANAGER_SETTINGS,
    },
    prompt: 'Remember that I prefer dark mode in all my editors.',
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory subagent to be called').toBe(
        true,
      );

      assertModelHasOutput(result);

      // Verify global GEMINI.md was written with the preference
      const globalGeminiMd = path.join(rig.homeDir!, '.gemini', 'GEMINI.md');
      const fileExists = fs.existsSync(globalGeminiMd);
      expect(fileExists, 'Expected global GEMINI.md to be created').toBe(true);

      if (fileExists) {
        const content = fs.readFileSync(globalGeminiMd, 'utf-8');
        expect(content.toLowerCase()).toContain('dark mode');
      }
    },
  });

  // ---------------------------------------------------------------------------
  // Saves personal fact
  // ---------------------------------------------------------------------------
  const savesPersonalFact = 'saves a personal fact via the memory subagent';
  evalTest('USUALLY_PASSES', {
    name: savesPersonalFact,
    params: {
      settings: MEMORY_MANAGER_SETTINGS,
    },
    prompt: "Please remember that my dog's name is Buddy.",
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory subagent to be called').toBe(
        true,
      );

      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: [/Buddy/i],
        testName: `${TEST_PREFIX}${savesPersonalFact}`,
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Ignores temporary information
  // ---------------------------------------------------------------------------
  const ignoresTemporaryInfo =
    'does not invoke subagent for transient conversation';
  evalTest('USUALLY_PASSES', {
    name: ignoresTemporaryInfo,
    params: {
      settings: MEMORY_MANAGER_SETTINGS,
    },
    prompt: "I'm going to grab lunch.",
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
    },
  });

  // ---------------------------------------------------------------------------
  // Proactive save on workflow statement
  // ---------------------------------------------------------------------------
  const proactiveSaveOnWorkflow =
    'proactively saves a workflow preference without explicit ask';
  evalTest('USUALLY_PASSES', {
    name: proactiveSaveOnWorkflow,
    params: {
      settings: MEMORY_MANAGER_SETTINGS,
    },
    prompt: 'Always run tests before committing.',
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(
        wasToolCalled,
        'Expected save_memory to be called proactively for a workflow',
      ).toBe(true);

      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: [/test|commit|remember|ok|will do/i],
        testName: `${TEST_PREFIX}${proactiveSaveOnWorkflow}`,
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Saves command alias
  // ---------------------------------------------------------------------------
  const savesCommandAlias = 'saves a command alias via the memory subagent';
  evalTest('USUALLY_PASSES', {
    name: savesCommandAlias,
    params: {
      settings: MEMORY_MANAGER_SETTINGS,
    },
    prompt:
      "When I say 'deploy', you should run 'npm run build && npm run deploy'.",
    assert: async (rig, result) => {
      const wasToolCalled = await rig.waitForToolCall('save_memory');
      expect(wasToolCalled, 'Expected save_memory subagent to be called').toBe(
        true,
      );

      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: [/deploy|remember|ok|will do/i],
        testName: `${TEST_PREFIX}${savesCommandAlias}`,
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Ignores workspace-specific info (should NOT save)
  // ---------------------------------------------------------------------------
  const ignoresTransientFileReference =
    'does not save transient workspace file paths to memory';
  evalTest('USUALLY_PASSES', {
    name: ignoresTransientFileReference,
    params: {
      settings: {
        experimental: { memoryManager: true },
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
    prompt:
      'The CI pipeline config is at `.github/workflows/ci.yml` in this repo.',
    assert: async (rig, result) => {
      await rig.waitForTelemetryReady();
      const wasToolCalled = rig
        .readToolLogs()
        .some((log) => log.toolRequest.name === 'save_memory');
      expect(
        wasToolCalled,
        'save_memory should not be called for a transient workspace file reference',
      ).toBe(false);

      assertModelHasOutput(result);
    },
  });
});
