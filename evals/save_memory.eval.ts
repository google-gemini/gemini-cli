/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import {
  evalTest,
  runEval,
  prepareLogDir,
  symlinkNodeModules,
} from './test-helper.js';
import {
  assertModelHasOutput,
  checkModelOutputContent,
  TestRig,
  GEMINI_DIR,
} from '../integration-tests/test-helper.js';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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
    'Agent saves preference mentioned early in a multi-turn session';
  runEval(
    'USUALLY_PASSES',
    proactiveMemoryFromLongSession,
    async () => {
      const rig = new TestRig();
      const { logDir, sanitizedName } = await prepareLogDir(
        proactiveMemoryFromLongSession,
      );
      const logFile = path.join(logDir, `${sanitizedName}.log`);

      let run: Awaited<ReturnType<TestRig['runInteractive']>> | undefined;
      try {
        rig.setup(proactiveMemoryFromLongSession, {
          settings: {
            experimental: {
              memoryManager: true,
            },
          },
        });

        // Symlink node modules for faster bootstrap.
        symlinkNodeModules(rig.testDir!);

        // Create workspace files for the agent to interact with across turns.
        fs.mkdirSync(path.join(rig.testDir!, 'src'), { recursive: true });
        fs.writeFileSync(
          path.join(rig.testDir!, 'src', 'index.ts'),
          'export const VERSION = "1.0.0";\n',
        );
        fs.writeFileSync(
          path.join(rig.testDir!, 'README.md'),
          '# Test Project\nA sample project.\n',
        );

        // Initialize a git repo so the CLI treats it as a real workspace.
        const execOpts = {
          cwd: rig.testDir!,
          stdio: 'ignore' as const,
        };
        execSync('git init', execOpts);
        execSync('git config user.email "test@example.com"', execOpts);
        execSync('git config user.name "Test User"', execOpts);
        execSync('git config core.editor "true"', execOpts);
        execSync('git config core.pager "cat"', execOpts);
        execSync('git config commit.gpgsign false', execOpts);
        execSync('git add .', execOpts);
        execSync('git commit -m "Initial commit"', execOpts);

        // Suppress the interactive terminal setup prompt.
        fs.writeFileSync(
          path.join(rig.homeDir!, GEMINI_DIR, 'state.json'),
          JSON.stringify({ terminalSetupPromptShown: true }, null, 2),
        );

        run = await rig.runInteractive();

        // Turn 1: State a persistent preference early in the conversation.
        await run.sendText(
          'By the way, I always prefer Vitest over Jest for testing. ' +
            'Please just acknowledge.',
        );
        await run.type('\r');
        // Wait for agent to respond before sending next message.
        await new Promise((resolve) => setTimeout(resolve, 30000));

        // Turn 2: Ask the agent to do a file task (pushes Turn 1 deeper in history).
        await run.sendText(
          'Read the file src/index.ts and tell me the version.',
        );
        await run.type('\r');
        await rig.waitForToolCall('read_file', 60000);
        // Wait for agent to finish its response after the tool call.
        await new Promise((resolve) => setTimeout(resolve, 20000));

        // Turn 3: Another unrelated task to push earlier turns further back.
        await run.sendText('Now list the files in the current directory.');
        await run.type('\r');
        await rig.waitForToolCall('list_directory', 60000);

        // Assert save_memory was proactively called with the Vitest preference
        // at some point during the session (most likely during Turn 1).
        const wasToolCalled = await rig.waitForToolCall(
          'save_memory',
          60000,
          (args) => /vitest/i.test(args),
        );
        expect(
          wasToolCalled,
          'Expected save_memory to be called with the Vitest preference from early in the session',
        ).toBe(true);
      } finally {
        if (run) {
          await fs.promises.writeFile(logFile, run.output);
        }
        await rig.cleanup();
      }
    },
    300000,
  );

  const memoryManagerRoutingInLongSession =
    'Agent routes global and project preferences to correct GEMINI.md files in multi-turn session';
  runEval(
    'USUALLY_PASSES',
    memoryManagerRoutingInLongSession,
    async () => {
      const rig = new TestRig();
      const { logDir, sanitizedName } = await prepareLogDir(
        memoryManagerRoutingInLongSession,
      );
      const logFile = path.join(logDir, `${sanitizedName}.log`);

      let run: Awaited<ReturnType<TestRig['runInteractive']>> | undefined;
      try {
        rig.setup(memoryManagerRoutingInLongSession, {
          settings: {
            experimental: {
              memoryManager: true,
            },
          },
        });

        symlinkNodeModules(rig.testDir!);

        // Create workspace files for the agent to interact with across turns.
        fs.mkdirSync(path.join(rig.testDir!, 'src'), { recursive: true });
        fs.writeFileSync(
          path.join(rig.testDir!, 'src', 'app.ts'),
          'console.log("hello world");\n',
        );
        fs.writeFileSync(
          path.join(rig.testDir!, 'package.json'),
          '{ "name": "test-project", "version": "1.0.0" }\n',
        );

        // Initialize a git repo so the CLI treats it as a real workspace.
        const execOpts = {
          cwd: rig.testDir!,
          stdio: 'ignore' as const,
        };
        execSync('git init', execOpts);
        execSync('git config user.email "test@example.com"', execOpts);
        execSync('git config user.name "Test User"', execOpts);
        execSync('git config core.editor "true"', execOpts);
        execSync('git config core.pager "cat"', execOpts);
        execSync('git config commit.gpgsign false', execOpts);
        execSync('git add .', execOpts);
        execSync('git commit -m "Initial commit"', execOpts);

        // Suppress the interactive terminal setup prompt.
        fs.writeFileSync(
          path.join(rig.homeDir!, GEMINI_DIR, 'state.json'),
          JSON.stringify({ terminalSetupPromptShown: true }, null, 2),
        );

        run = await rig.runInteractive();

        // Turn 1: State a GLOBAL preference (applies to all projects).
        await run.sendText(
          'I always use dark mode in all my editors and terminals. ' +
            'Please just acknowledge.',
        );
        await run.type('\r');
        await new Promise((resolve) => setTimeout(resolve, 30000));

        // Turn 2: File task to push Turn 1 deeper in history.
        await run.sendText(
          'Read the file src/app.ts and tell me what it does.',
        );
        await run.type('\r');
        await rig.waitForToolCall('read_file', 60000);
        await new Promise((resolve) => setTimeout(resolve, 20000));

        // Turn 3: State a PROJECT-SPECIFIC preference.
        await run.sendText(
          'For this project specifically, we use 2-space indentation. ' +
            'Please just acknowledge.',
        );
        await run.type('\r');

        // Wait for save_memory to be proactively called at least once.
        // The agent should trigger it for each preference as it encounters them.
        const wasToolCalled = await rig.waitForToolCall('save_memory', 120000);
        expect(
          wasToolCalled,
          'Expected save_memory to be proactively called',
        ).toBe(true);

        // Wait for the memory manager subagent to finish writing files.
        await new Promise((resolve) => setTimeout(resolve, 45000));

        // Assert: Global preference was routed to ~/.gemini/GEMINI.md
        const globalGeminiMd = path.join(rig.homeDir!, GEMINI_DIR, 'GEMINI.md');
        const globalContent = fs.existsSync(globalGeminiMd)
          ? fs.readFileSync(globalGeminiMd, 'utf-8')
          : '';
        expect(
          /dark mode/i.test(globalContent),
          `Expected global GEMINI.md to contain "dark mode". ` +
            `Content: ${globalContent.slice(0, 500)}`,
        ).toBe(true);

        // Assert: Project preference was routed to ./GEMINI.md or ./.gemini/GEMINI.md
        const projectGeminiMd = path.join(rig.testDir!, 'GEMINI.md');
        const projectGeminiDirMd = path.join(
          rig.testDir!,
          GEMINI_DIR,
          'GEMINI.md',
        );
        const projectContent =
          (fs.existsSync(projectGeminiMd)
            ? fs.readFileSync(projectGeminiMd, 'utf-8')
            : '') +
          (fs.existsSync(projectGeminiDirMd)
            ? fs.readFileSync(projectGeminiDirMd, 'utf-8')
            : '');
        expect(
          /2[- ]?space|indentation/i.test(projectContent),
          `Expected project GEMINI.md to contain indentation preference. ` +
            `Content: ${projectContent.slice(0, 500)}`,
        ).toBe(true);
      } finally {
        if (run) {
          await fs.promises.writeFile(logFile, run.output);
        }
        await rig.cleanup();
      }
    },
    300000,
  );
});
