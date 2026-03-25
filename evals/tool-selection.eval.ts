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
  LS_TOOL_NAME,
} from '@google/gemini-cli-core';
import { evalTest } from './test-helper.js';

describe('Tool Selection', () => {
  /**
   * When searching for a string in code, the agent should use grep_search
   * rather than reading every file.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use grep over reading all files for string search',
    prompt:
      'Search for all TODO comments in this codebase using grep_search and list them.',
    files: {
      'src/app.js':
        '// TODO: add error handling\nconsole.log("hello");\n'.repeat(30),
      'src/utils.js':
        'function helper() { return true; }\n'.repeat(25) +
        '/* TODO: optimize this */ \n',
      'src/routes.js':
        'const router = require("express").Router();\n'.repeat(25) +
        '// TODO: add auth middleware\n',
      'src/db.js': 'const pool = require("pg").Pool();\n'.repeat(30),
      'src/middleware.js': '// request validation\n'.repeat(30),
      'src/config.js': 'module.exports = {};\n'.repeat(30),
      'src/logger.js': 'console.log;\n'.repeat(30),
      'src/cache.js': 'const cache = {};\n'.repeat(30),
      'test/app.test.js':
        'test("works", () => { expect(true).toBe(true); });\n'.repeat(20),
      'test/utils.test.js': 'test("helper", () => {});\n'.repeat(20),
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const grepCalls = toolLogs.filter(
        (log) => log.toolRequest.name === GREP_TOOL_NAME,
      );
      expect(
        grepCalls.length,
        'Expected agent to use grep_search for finding TODOs',
      ).toBeGreaterThanOrEqual(1);

      // Agent should not fall back to reading every file individually
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === READ_FILE_TOOL_NAME,
      );
      expect(
        readCalls.length,
        'Expected agent not to read all files individually when grep_search is available',
      ).toBeLessThan(5);

      // Agent should complete the search in a single turn
      const uniqueTurns = new Set(
        grepCalls.map((call) => call.toolRequest.prompt_id).filter(Boolean),
      );
      expect(
        uniqueTurns.size,
        'Expected grep_search calls to occur within a single turn',
      ).toBeLessThanOrEqual(1);
    },
  });

  /**
   * When asked to count lines in files, the agent should use shell
   * commands (wc -l) rather than reading files.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use shell for counting operations',
    prompt: 'How many lines of code are in the src directory?',
    files: {
      'src/app.js': Array.from({ length: 50 }, (_, i) => `// Line ${i}`).join(
        '\n',
      ),
      'src/utils.js': Array.from({ length: 30 }, (_, i) => `// Util ${i}`).join(
        '\n',
      ),
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === SHELL_TOOL_NAME,
      );
      // Agent should use shell (wc, find, cloc) rather than reading every file
      expect(shellCalls.length).toBeGreaterThanOrEqual(1);

      // Agent should not read files individually to count lines
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === READ_FILE_TOOL_NAME,
      );
      expect(
        readCalls.length,
        'Expected agent not to read files individually when shell counting is available',
      ).toBeLessThan(3);

      // Agent should complete the count in a single turn
      const uniqueTurns = new Set(
        shellCalls.map((call) => call.toolRequest.prompt_id).filter(Boolean),
      );
      expect(
        uniqueTurns.size,
        'Expected shell counting to occur within a single turn',
      ).toBeLessThanOrEqual(1);
    },
  });

  /**
   * When asked to check if a port is in use, the agent should use shell
   * commands, not try to read config files.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use shell commands for system queries',
    prompt: 'Check if port 3000 is currently in use.',
    files: {
      'app.js': 'const port = 3000;',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === SHELL_TOOL_NAME,
      );
      expect(
        shellCalls.length,
        'Expected agent to use shell for system queries',
      ).toBeGreaterThanOrEqual(1);

      const hasPortCheck = shellCalls.some((call) => {
        let args = call.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            /* */
          }
        }
        const cmd = typeof args === 'string' ? args : args?.command || '';
        return (
          cmd.includes('lsof') ||
          cmd.includes('netstat') ||
          cmd.includes('ss ') ||
          cmd.includes('3000')
        );
      });
      expect(hasPortCheck, 'Expected port checking command').toBe(true);
    },
  });

  /**
   * When asked to check git history, the agent should use git log, not
   * try to read .git directory.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use git log for history queries',
    prompt: 'Show me the last 5 commits in this repo.',
    files: {
      '.git/HEAD': 'ref: refs/heads/main',
      '.git/config': '[core]\n\trepositoryformatversion = 0',
      'app.js': 'console.log("hello");',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === SHELL_TOOL_NAME,
      );

      const gitLogCall = shellCalls.find((call) => {
        let args = call.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            /* */
          }
        }
        const cmd = typeof args === 'string' ? args : args?.command || '';
        return cmd.includes('git log');
      });
      expect(gitLogCall, 'Expected agent to use git log').toBeDefined();
    },
  });

  /**
   * For simple string replacements across files, the agent should use
   * sed or grep+replace rather than reading each file individually.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should choose efficient tools for bulk operations',
    prompt:
      'Replace all console.log calls with logger.info across all files in src/.',
    files: {
      'src/app.js': 'console.log("starting");\nconsole.log("ready");',
      'src/server.js': 'console.log("listening on port 3000");',
      'src/utils.js': 'console.log("util loaded");',
      'src/logger.js': 'module.exports = { info: console.info };',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Verify the replacement happened
      const app = rig.readFile('src/app.js');
      const server = rig.readFile('src/server.js');
      const utils = rig.readFile('src/utils.js');

      // At least some files should be updated
      const updated = [app, server, utils].filter(
        (content) =>
          content.includes('logger') && !content.includes('console.log'),
      );
      expect(
        updated.length,
        'Expected at least some files to be updated',
      ).toBeGreaterThanOrEqual(2);
    },
  });

  /**
   * When asked a yes/no question about code, the agent should read the
   * relevant file and answer without making changes.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should answer questions without making changes',
    prompt: 'Does this project use TypeScript?',
    files: {
      'package.json':
        '{"name": "js-app", "dependencies": {"express": "^4.18.0"}}',
      'src/app.js': 'console.log("hello");',
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
        'Should not make edits when answering a question',
      ).toBe(0);
    },
  });
});
