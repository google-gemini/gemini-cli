/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
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
        (log) => log.toolRequest.name === 'google_web_search',
      );
      expect(
        searchCalls.length,
        'Expected agent to call google_web_search for current information',
      ).toBeGreaterThanOrEqual(1);
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
        (log) => log.toolRequest.name === 'web_fetch',
      );
      expect(
        fetchCalls.length,
        'Expected agent to call web_fetch for a specific URL',
      ).toBeGreaterThanOrEqual(1);
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
          log.toolRequest.name === 'google_web_search' ||
          log.toolRequest.name === 'web_fetch',
      );
      expect(
        webCalls.length,
        'Agent should not use web tools when the answer is in local files',
      ).toBe(0);
    },
  });
});
