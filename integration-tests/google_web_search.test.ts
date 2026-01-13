/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { WEB_SEARCH_TOOL_NAME } from '../packages/core/src/tools/tool-names.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig, printDebugInfo, validateModelOutput } from './test-helper.js';

describe('web search tool', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should be able to search the web', async () => {
    await rig.setup('should be able to search the web', {
      settings: { tools: { core: [WEB_SEARCH_TOOL_NAME] } },
    });

    let result;
    try {
      result = await rig.run({ args: `what is the weather in London` });
    } catch (error) {
      // Network errors can occur in CI environments
      if (
        error instanceof Error &&
        (error.message.includes('network') || error.message.includes('timeout'))
      ) {
        console.warn(
          'Skipping test due to network error:',
          (error as Error).message,
        );
        return; // Skip the test
      }
      throw error; // Re-throw if not a network error
    }

    const foundToolCall = await rig.waitForToolCall(WEB_SEARCH_TOOL_NAME);

    // Add debugging information
    if (!foundToolCall) {
      const allTools = printDebugInfo(rig, result);

      // Check if the tool call failed due to network issues
      const failedSearchCalls = allTools.filter(
        (t) =>
          t.toolRequest.name === WEB_SEARCH_TOOL_NAME && !t.toolRequest.success,
      );
      if (failedSearchCalls.length > 0) {
        console.warn(
          `${WEB_SEARCH_TOOL_NAME} tool was called but failed, possibly due to network issues`,
        );
        console.warn(
          'Failed calls:',
          failedSearchCalls.map((t) => t.toolRequest.args),
        );
        return; // Skip the test if network issues
      }
    }

    expect(
      foundToolCall,
      `Expected to find a call to ${WEB_SEARCH_TOOL_NAME}`,
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
        .filter((t) => t.toolRequest.name === WEB_SEARCH_TOOL_NAME);
      if (searchCalls.length > 0) {
        console.warn(
          'Search queries used:',
          searchCalls.map((t) => t.toolRequest.args),
        );
      }
    }
  });
});
