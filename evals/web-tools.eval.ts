/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import {
  WEB_SEARCH_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
} from '@google/gemini-cli-core';
import { evalTest } from './test-helper.js';

describe('Web Tools', () => {
  /**
   * Agent must decide to use google_web_search without being told to.
   * The task requires current external information not available locally.
   * No URL is provided -- the agent must choose search over fetch.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use google_web_search for current information not in local files',
    prompt:
      'What is the current stable version of Node.js? I need to update my Dockerfile.',
    files: {
      Dockerfile: 'FROM node:18\nWORKDIR /app\nCOPY . .\nRUN npm install\n',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const searchCalls = toolLogs.filter(
        (log) => log.toolRequest.name === WEB_SEARCH_TOOL_NAME,
      );
      expect(
        searchCalls.length,
        'Expected agent to search for current Node.js version',
      ).toBeGreaterThanOrEqual(1);

      // Should not use web_fetch (no URL was given)
      const fetchCalls = toolLogs.filter(
        (log) => log.toolRequest.name === WEB_FETCH_TOOL_NAME,
      );
      expect(
        fetchCalls.length,
        'Agent should not use web_fetch when no URL is provided',
      ).toBe(0);

      // Should complete in a single turn
      const uniqueTurns = new Set(
        searchCalls.map((c) => c.toolRequest.prompt_id).filter(Boolean),
      );
      expect(uniqueTurns.size).toBeLessThanOrEqual(1);
    },
  });

  /**
   * Agent must choose web_fetch over web_search when a specific URL is given.
   * The agent may be tempted to search for the topic instead of fetching
   * the exact URL -- this tests that it respects the explicit URL.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use web_fetch for a specific URL rather than searching',
    prompt:
      'Can you pull the content from https://raw.githubusercontent.com/nodejs/node/main/CHANGELOG.md and tell me what changed in the latest release?',
    files: {
      'notes.md': '# Release Notes\n',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const fetchCalls = toolLogs.filter(
        (log) => log.toolRequest.name === WEB_FETCH_TOOL_NAME,
      );
      expect(
        fetchCalls.length,
        'Expected agent to use web_fetch for the specific URL provided',
      ).toBeGreaterThanOrEqual(1);

      // Should not search -- the URL was already provided
      const searchCalls = toolLogs.filter(
        (log) => log.toolRequest.name === WEB_SEARCH_TOOL_NAME,
      );
      expect(
        searchCalls.length,
        'Agent should not use google_web_search when a specific URL was given',
      ).toBe(0);
    },
  });

  /**
   * The answer is in local files. Agent should read the file, not search.
   * The question is phrased ambiguously -- "what version" could suggest
   * searching, but the package.json has the answer locally.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should read local files rather than searching when the answer is local',
    prompt: 'What version of React is this project using?',
    files: {
      'package.json': JSON.stringify({
        name: 'my-app',
        dependencies: { react: '18.2.0', 'react-dom': '18.2.0' },
      }),
      'src/App.js':
        'import React from "react";\nexport default function App() { return <div>Hello</div>; }\n',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const webCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === WEB_SEARCH_TOOL_NAME ||
          log.toolRequest.name === WEB_FETCH_TOOL_NAME,
      );
      expect(
        webCalls.length,
        'Agent should not use web tools when the answer is in package.json',
      ).toBe(0);
    },
  });

  /**
   * Hard case: a URL is mentioned in context but the task is purely local.
   * The agent should resist fetching the URL and focus on the local task.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should not fetch a URL mentioned in context when the task is local',
    prompt:
      'I found this library at https://lodash.com but I want to implement my own version. Look at utils.js and add a clamp function that limits a number between min and max.',
    files: {
      'utils.js':
        'function range(start, end) {\n  return Array.from({ length: end - start }, (_, i) => i + start);\n}\nmodule.exports = { range };\n',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const webCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === WEB_SEARCH_TOOL_NAME ||
          log.toolRequest.name === WEB_FETCH_TOOL_NAME,
      );
      expect(
        webCalls.length,
        'Agent should not fetch the URL when the task is purely local',
      ).toBe(0);

      // Should have added the clamp function
      const content = rig.readFile('utils.js');
      expect(
        content.includes('clamp'),
        'Expected clamp function to be added to utils.js',
      ).toBe(true);
    },
  });
});
