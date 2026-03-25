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
   * When asked to search for current information that cannot be answered
   * from local files, the agent should use google_web_search.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use google_web_search for current information queries',
    prompt:
      'What are the top tech news stories happening right now today? Search the web to find out.',
    files: {
      'app.js': 'console.log("hello world");',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const searchCalls = toolLogs.filter(
        (log) => log.toolRequest.name === WEB_SEARCH_TOOL_NAME,
      );
      expect(
        searchCalls.length,
        'Expected agent to call google_web_search for current information',
      ).toBeGreaterThanOrEqual(1);

      // Agent should not also call web_fetch for the same query (wrong tool)
      const fetchCalls = toolLogs.filter(
        (log) => log.toolRequest.name === WEB_FETCH_TOOL_NAME,
      );
      expect(
        fetchCalls.length,
        'Expected agent to use google_web_search, not web_fetch, for open-ended queries',
      ).toBe(0);

      // Search should complete in a single turn
      const uniqueTurns = new Set(
        searchCalls.map((call) => call.toolRequest.prompt_id).filter(Boolean),
      );
      expect(
        uniqueTurns.size,
        'Expected web search to occur within a single turn',
      ).toBeLessThanOrEqual(1);
    },
  });

  /**
   * When asked to read or summarize a specific URL, the agent should use
   * web_fetch rather than google_web_search.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use web_fetch when given a specific URL',
    prompt:
      'Read the contents of https://example.com and summarize what it says.',
    files: {
      'notes.md': '# Notes\n',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const fetchCalls = toolLogs.filter(
        (log) => log.toolRequest.name === WEB_FETCH_TOOL_NAME,
      );
      expect(
        fetchCalls.length,
        'Expected agent to call web_fetch for a specific URL',
      ).toBeGreaterThanOrEqual(1);

      // Agent should not use google_web_search when a direct URL is given
      const searchCalls = toolLogs.filter(
        (log) => log.toolRequest.name === WEB_SEARCH_TOOL_NAME,
      );
      expect(
        searchCalls.length,
        'Expected agent to use web_fetch, not google_web_search, when given a specific URL',
      ).toBe(0);
    },
  });

  /**
   * When the answer is clearly available in local files, the agent should
   * NOT use web tools — even when the prompt could be interpreted as
   * requiring external information.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should not use web tools when answer is in local files',
    prompt: 'What does the greeting function in app.js return?',
    files: {
      'app.js': `
function greeting(name) {
  return "Hello, " + name + "!";
}
module.exports = { greeting };
`,
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
        'Agent should not use web tools when the answer is in local files',
      ).toBe(0);
    },
  });

  /**
   * Hard case: the prompt mentions a URL in passing but the actual task is
   * a local code question. The agent should NOT fetch the URL.
   *
   * This is a harder behavioral test -- the model sometimes fetches URLs
   * mentioned in context even when the task does not require it.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should not fetch a URL mentioned in context when the task is local',
    prompt:
      'I found this library at https://lodash.com but I want to implement my own version. Look at utils.js and add a clamp function that limits a number between min and max.',
    files: {
      'utils.js': `
// Utility functions
function range(start, end) {
  return Array.from({ length: end - start }, (_, i) => i + start);
}
module.exports = { range };
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Should NOT fetch the lodash URL -- it was mentioned as context only
      const webCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === WEB_SEARCH_TOOL_NAME ||
          log.toolRequest.name === WEB_FETCH_TOOL_NAME,
      );
      expect(
        webCalls.length,
        'Agent should not fetch the URL when the task is purely local',
      ).toBe(0);

      // Should have added a clamp function
      const writeCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'write_file' ||
          log.toolRequest.name === 'replace',
      );
      expect(
        writeCalls.length,
        'Expected agent to write the clamp function',
      ).toBeGreaterThanOrEqual(1);

      const content = rig.readFile('utils.js');
      expect(
        content.includes('clamp'),
        'Expected clamp function to be added to utils.js',
      ).toBe(true);
    },
  });
});
