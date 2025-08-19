/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { TestRig, printDebugInfo, validateModelOutput } from './test-helper.js';

describe('google_web_search', () => {
  let rig: TestRig;

  beforeEach(async () => {
    rig = new TestRig();
    await rig.setup('should be able to search the web');
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should be able to search the web', async () => {
    const result = await rig.run(`what is the weather in London`);

    const foundToolCall = await rig.waitForToolCall('google_web_search');

    // Add debugging information
    if (!foundToolCall) {
      printDebugInfo(rig, result);
    }

    expect(
      foundToolCall,
      'Expected to find a call to google_web_search',
    ).toBeTruthy();

    // Validate model output - will throw if no output, warn if missing expected content
    const hasExpectedContent = validateModelOutput(
      result,
      ['weather', 'london'],
      'Google web search test',
    );

    // If content was missing, log the search queries used
    if (!hasExpectedContent) {
      const searchCalls = rig
        .readToolLogs()
        .filter((t) => t.toolRequest.name === 'google_web_search');
      if (searchCalls.length > 0) {
        console.warn(
          'Search queries used:',
          searchCalls.map((t) => t.toolRequest.args),
        );
      }
    }
  });
});
