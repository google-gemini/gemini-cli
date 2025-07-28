/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

test('should be able to save to memory', async () => {
  const rig = new TestRig();
  await rig.setup('should be able to save to memory');

  const prompt = `remember that my favorite color is  blue.

  what is my favorite color? tell me that and surround it with $ symbol`;
  const result = await rig.run(prompt);

  const foundToolCall = await rig.waitForToolCall('save_memory');

  assert.ok(foundToolCall, 'Expected to find a save_memory tool call');
  assert.ok(result.toLowerCase().includes('blue'));
});
