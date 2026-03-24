/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import {
  WEB_FETCH_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
} from '@google/gemini-cli-core';

/**
 * Behavioral evals that verify the agent selects the correct web tool based on
 * whether the user supplies a specific URL (→ web_fetch) or an open-ended
 * topic (→ google_web_search).
 *
 * Tool semantics (from their descriptions):
 *  - google_web_search: "Use this when you don't have a specific URL."
 *  - web_fetch: fetches the content at a known URL.
 */
describe('Web Tool Selection', () => {
  // -------------------------------------------------------------------------
  // web_fetch cases — user provides a concrete URL
  // -------------------------------------------------------------------------

  evalTest('ALWAYS_PASSES', {
    name: 'should use web_fetch when the user supplies a specific URL',
    prompt: 'Fetch the content at https://example.com and summarize it for me.',
    assert: async (rig) => {
      const logs = rig.readToolLogs();
      const toolNames = logs.map((l) => l.toolRequest.name);

      expect(
        toolNames,
        'Agent should have called web_fetch for a specific URL',
      ).toContain(WEB_FETCH_TOOL_NAME);

      expect(
        toolNames,
        'Agent should NOT use google_web_search when a specific URL is provided',
      ).not.toContain(WEB_SEARCH_TOOL_NAME);
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should pass the URL to web_fetch args when a specific URL is given',
    prompt:
      'Please read https://example.com/robots.txt and tell me what it says.',
    assert: async (rig) => {
      const logs = rig.readToolLogs();
      const toolNames = logs.map((l) => l.toolRequest.name);

      expect(
        toolNames,
        'Agent should have called web_fetch for a specific URL',
      ).toContain(WEB_FETCH_TOOL_NAME);

      // The URL provided in the prompt should appear in the web_fetch args
      const fetchCalls = logs.filter(
        (l) => l.toolRequest.name === WEB_FETCH_TOOL_NAME,
      );
      const urlFound = fetchCalls.some((call) => {
        try {
          // Per general rules, toolRequest.args is a JSON string that should be parsed.
          const params = JSON.parse(call.toolRequest.args) as {
            prompt?: string;
            url?: string;
          };
          // The URL can be in either the 'prompt' or 'url' argument.
          return (
            params.prompt?.includes('example.com') ||
            params.url?.includes('example.com')
          );
        } catch {
          // Fallback for safety, though args should be a valid JSON string.
          return call.toolRequest.args.includes('example.com');
        }
      });
      expect(
        urlFound,
        'web_fetch args should reference the URL from the prompt',
      ).toBe(true);
    },
  });

  // -------------------------------------------------------------------------
  // google_web_search cases — user asks an open-ended question with no URL
  // -------------------------------------------------------------------------

  evalTest('ALWAYS_PASSES', {
    name: 'should use google_web_search for an open-ended topic with no URL',
    prompt:
      'Search the web to find the latest stable release version of Node.js.',
    assert: async (rig) => {
      const logs = rig.readToolLogs();
      const toolNames = logs.map((l) => l.toolRequest.name);

      expect(
        toolNames,
        'Agent should have called google_web_search for an open-ended topic',
      ).toContain(WEB_SEARCH_TOOL_NAME);

      expect(
        toolNames,
        'Agent should NOT call web_fetch when no URL was provided',
      ).not.toContain(WEB_FETCH_TOOL_NAME);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should use google_web_search when asked to research a broad topic',
    prompt:
      'What are the most popular JavaScript frameworks in 2025? Search the web.',
    assert: async (rig) => {
      const logs = rig.readToolLogs();
      const toolNames = logs.map((l) => l.toolRequest.name);

      expect(
        toolNames,
        'Agent should have called google_web_search for a broad research topic',
      ).toContain(WEB_SEARCH_TOOL_NAME);
    },
  });
});
