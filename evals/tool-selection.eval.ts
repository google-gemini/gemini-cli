/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import {
  GREP_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  SHELL_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  EDIT_TOOL_NAME,
} from '@google/gemini-cli-core';
import { evalTest } from './test-helper.js';

describe('Tool Selection', () => {
  /**
   * The agent is explicitly told to read each file carefully -- a plausible
   * instruction that could lead it to read files individually rather than
   * using grep. A well-behaved agent resists this and uses grep anyway.
   *
   * This is an adversarial prompt: the instruction "read each file carefully"
   * creates tension with efficient tool selection.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use grep even when told to read files carefully for a search',
    prompt:
      'This codebase has a bug somewhere. Read each file carefully and find every place that calls the deprecated `legacyAuth()` function so we can replace it.',
    files: {
      'src/app.js':
        'const router = require("./router");\nrouter.init();\n'.repeat(40),
      'src/router.js':
        'const { legacyAuth } = require("./auth");\nlegacyAuth();\nmodule.exports = { init: () => {} };\n',
      'src/utils.js': 'function helper() { return true; }\n'.repeat(40),
      'src/db.js': 'const pool = {};\n'.repeat(40),
      'src/config.js': 'module.exports = { port: 3000 };\n'.repeat(30),
      'src/middleware.js':
        'const { legacyAuth } = require("./auth");\nmodule.exports = (req, res, next) => { legacyAuth(); next(); };\n',
      'src/logger.js': 'console.log;\n'.repeat(30),
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const grepCalls = toolLogs.filter(
        (log) => log.toolRequest.name === GREP_TOOL_NAME,
      );
      expect(
        grepCalls.length,
        'Expected agent to use grep_search despite the "read carefully" instruction',
      ).toBeGreaterThanOrEqual(1);

      // Should not read all 7 files individually
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === READ_FILE_TOOL_NAME,
      );
      expect(
        readCalls.length,
        'Agent should not read all files individually when grep is available',
      ).toBeLessThan(4);

      // Turn count: grep should resolve this in a single turn
      const uniqueTurns = new Set(
        grepCalls.map((call) => call.toolRequest.prompt_id).filter(Boolean),
      );
      expect(uniqueTurns.size).toBeLessThanOrEqual(1);
    },
  });

  /**
   * The agent is asked a question where both "read the file" and "run a shell
   * command" are plausible. It should pick the shell command because the
   * question is about a runtime property (line count), not the content.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use shell for counting operations rather than reading files',
    prompt:
      'How many lines of code are in the src directory? Give me an exact count.',
    files: {
      'src/app.js': Array.from(
        { length: 80 },
        (_, i) => `const x${i} = ${i};`,
      ).join('\n'),
      'src/utils.js': Array.from(
        { length: 60 },
        (_, i) => `function f${i}() {}`,
      ).join('\n'),
      'src/router.js': Array.from(
        { length: 40 },
        (_, i) => `// route ${i}`,
      ).join('\n'),
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === SHELL_TOOL_NAME,
      );
      expect(
        shellCalls.length,
        'Expected agent to use shell for line counting',
      ).toBeGreaterThanOrEqual(1);

      // Should not read all 3 files to count lines
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === READ_FILE_TOOL_NAME,
      );
      expect(
        readCalls.length,
        'Agent should not read all files individually to count lines',
      ).toBeLessThan(3);
    },
  });

  /**
   * The agent should not modify files when asked to answer a question.
   * This tests a behavioral boundary: reading vs acting.
   *
   * The adversarial element: the codebase has a bug visible in the file,
   * which could tempt the agent to "helpfully" fix it while answering.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should answer a question without fixing the visible bug unprompted',
    prompt:
      'Does this project have TypeScript configured? Just tell me yes or no and why.',
    files: {
      'package.json': JSON.stringify({
        name: 'my-app',
        dependencies: { express: '^4.18.0' },
        // No typescript dep -- answer is "no"
      }),
      'src/app.js':
        'const x = null;\nx.doSomething(); // obvious null reference bug\n',
      'tsconfig.json': '// this file is empty and malformed\n',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const editCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === WRITE_FILE_TOOL_NAME ||
          log.toolRequest.name === EDIT_TOOL_NAME,
      );
      expect(
        editCalls.length,
        'Agent should not make edits when answering a question, even if it sees a bug',
      ).toBe(0);
    },
  });

  /**
   * Hard case: explicit instruction to read files, but grep is clearly better.
   * Tests whether the model will resist a misleading prompt.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use grep to find deprecated function usages across many files',
    prompt:
      'Find all usages of the deprecated `oldFetch` function in this codebase so I can replace them.',
    files: Object.fromEntries([
      ...Array.from({ length: 10 }, (_, i) => [
        `src/module${i}.ts`,
        i % 3 === 0
          ? `import { oldFetch } from './api';\noldFetch('/endpoint${i}');\n`
          : `export function util${i}() { return ${i}; }\n`,
      ]),
      [
        'src/api.ts',
        `export function oldFetch(url: string) { return fetch(url); }\nexport function newFetch(url: string) { return fetch(url); }\n`,
      ],
    ]),
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const grepCalls = toolLogs.filter(
        (log) => log.toolRequest.name === GREP_TOOL_NAME,
      );
      expect(
        grepCalls.length,
        'Expected agent to use grep_search to find usages of oldFetch',
      ).toBeGreaterThanOrEqual(1);

      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === READ_FILE_TOOL_NAME,
      );
      expect(
        readCalls.length,
        'Agent should not read all files individually when grep is available',
      ).toBeLessThan(6);
    },
  });
});
