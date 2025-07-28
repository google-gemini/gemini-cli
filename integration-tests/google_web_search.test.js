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

  await rig.run(`what is the weather in London`);

  const foundToolCall = await rig.waitForToolCall('google_web_search');

  assert.ok(foundToolCall, 'Expected to find a call to google_web_search');
});
