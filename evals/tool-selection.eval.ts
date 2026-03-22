/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Tool Selection', () => {
  /**
   * When searching for a string across a large codebase, the agent should
   * use grep_search rather than reading every file individually.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use grep_search over reading all files for string search',
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
        (log) => log.toolRequest.name === 'grep_search',
      );
      expect(
        grepCalls.length,
        'Expected agent to use grep_search for finding TODOs across a large codebase',
      ).toBeGreaterThanOrEqual(1);
    },
  });

  /**
   * When asked to count lines or files, the agent should use shell commands
   * rather than reading every file to count manually.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use shell for counting operations',
    prompt: 'How many lines of code are in the src directory?',
    files: {
      'src/app.js': 'console.log("hello");\n'.repeat(50),
      'src/utils.js': 'module.exports = {};\n'.repeat(30),
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );
      expect(
        shellCalls.length,
        'Expected agent to use run_shell_command for counting lines',
      ).toBeGreaterThanOrEqual(1);
    },
  });

  /**
   * When asked about git history, the agent should use a shell command
   * (git log) rather than reading .git files directly.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use git log for history queries',
    prompt: 'Show me the last 3 git commits in this project.',
    files: {
      'app.js': 'console.log("hello");',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );
      expect(
        shellCalls.length,
        'Expected agent to use run_shell_command for git log',
      ).toBeGreaterThanOrEqual(1);
    },
  });

  /**
   * When asked to perform bulk operations across many files, the agent
   * should choose efficient tools (glob, grep_search) rather than
   * reading each file individually.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should choose efficient tools for bulk operations',
    prompt:
      'Find all JavaScript files in this project that import express and list their paths.',
    files: {
      'src/app.js':
        "const express = require('express');\nconst app = express();\n",
      'src/utils.js': 'module.exports = {};',
      'src/logger.js': 'const winston = require("winston");',
      'src/server.js':
        "const express = require('express');\nconst server = express();\n",
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const efficientCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'grep_search' ||
          log.toolRequest.name === 'glob',
      );
      expect(
        efficientCalls.length,
        'Expected agent to use grep_search or glob to find files efficiently',
      ).toBeGreaterThanOrEqual(1);
    },
  });

  /**
   * When asked a question that can be answered by reading a local file,
   * the agent should NOT make unnecessary changes to files.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should answer questions without making changes',
    prompt: 'What version of the package is defined in package.json?',
    files: {
      'package.json':
        '{"name": "my-app", "version": "2.3.1", "description": "A test app"}',
      'src/app.js': 'console.log("hello");',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const writeCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'write_file' ||
          log.toolRequest.name === 'replace',
      );
      expect(
        writeCalls.length,
        'Agent should not modify files when only answering a question',
      ).toBe(0);
    },
  });

  /**
   * When querying system information, the agent should use shell commands
   * rather than reading system files directly.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use shell commands for system queries',
    prompt: 'What version of Node.js is installed on this system?',
    files: {
      'app.js': 'console.log("hello");',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );
      expect(
        shellCalls.length,
        'Expected agent to use run_shell_command for system queries',
      ).toBeGreaterThanOrEqual(1);
    },
  });
});
