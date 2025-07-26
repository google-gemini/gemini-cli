/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

test('should be able to search the web', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);

  await rig.run(`what is the weather in London`);

  const poll = async (predicate, timeout, interval) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (predicate()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    return false;
  };

  const foundToolCall = await poll(
    () => {
      const toolLogs = rig.readToolLogs();
      return toolLogs.some(
        (log) => log.toolRequest.name === 'google_web_search',
      );
    },
    5000, // 5 seconds
    500, // 500ms
  );

  assert.ok(foundToolCall, 'Expected to find a call to google_web_search');
});
