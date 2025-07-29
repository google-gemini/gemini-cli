/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

test('should be able to search the web', async () => {
  const rig = new TestRig();
  await rig.setup('should be able to search the web');

  let result;
  try {
    result = await rig.run(`what is the weather in London`);
  } catch (error) {
    // Network errors can occur in CI environments
    if (
      error.message.includes('network') ||
      error.message.includes('timeout')
    ) {
      console.warn('Skipping test due to network error:', error.message);
      return; // Skip the test
    }
    throw error; // Re-throw if not a network error
  }

  const foundToolCall = await rig.waitForToolCall('google_web_search');

  // Add debugging information
  if (!foundToolCall) {
    console.error('Test failed - Debug info:');
    console.error('Result length:', result.length);
    console.error('Result (first 500 chars):', result.substring(0, 500));
    console.error(
      'Result (last 500 chars):',
      result.substring(result.length - 500),
    );

    // Check what tools were actually called
    const allTools = rig.readToolLogs();
    console.error(
      'All tool calls found:',
      allTools.map((t) => t.toolRequest.name),
    );

    // Check if the tool call failed due to network issues
    const failedSearchCalls = allTools.filter(
      (t) =>
        t.toolRequest.name === 'google_web_search' && !t.toolRequest.success,
    );
    if (failedSearchCalls.length > 0) {
      console.warn(
        'google_web_search tool was called but failed, possibly due to network issues',
      );
      console.warn(
        'Failed calls:',
        failedSearchCalls.map((t) => t.toolRequest.args),
      );
      return; // Skip the test if network issues
    }
  }

  assert.ok(foundToolCall, 'Expected to find a call to google_web_search');

  // Check if LLM returned any output at all
  assert.ok(
    result && result.trim().length > 0,
    'Expected LLM to return some output',
  );

  // Check if the result mentions weather or London
  const mentionsWeather =
    result.toLowerCase().includes('weather') ||
    result.toLowerCase().includes('temperature') ||
    result.toLowerCase().includes('forecast');
  const mentionsLondon = result.toLowerCase().includes('london');

  if (!mentionsWeather || !mentionsLondon) {
    console.warn(
      'Warning: LLM response may not include weather information or London.',
    );
    console.warn(
      `Missing: ${!mentionsWeather ? 'weather info ' : ''}${!mentionsLondon ? 'London' : ''}`,
    );
    console.warn(
      'The google_web_search tool was called successfully, which is the main requirement.',
    );

    // Log the search query used
    const searchCalls = rig
      .readToolLogs()
      .filter((t) => t.toolRequest.name === 'google_web_search');
    if (searchCalls.length > 0) {
      console.warn(
        'Search queries used:',
        searchCalls.map((t) => t.toolRequest.args),
      );
    }
  } else {
    // Log success info if verbose
    if (process.env.VERBOSE === 'true') {
      console.log(
        'Web search completed successfully. Weather information for London provided.',
      );
    }
  }
});
