/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

test('should be able to save to memory', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);

  const prompt = `remember that my favorite color is  blue.

  what is my favorite color? tell me that and surround it with $ symbol`;
  const cliPromise = rig.run(prompt);

  const toolCall = await rig.waitForToolCall('save_memory');
  assert.deepEqual(toolCall, {
    tool_name: 'save_memory',
    args: {
      fact: 'My favorite color is blue.',
    },
  });

  const result = await cliPromise;
  assert.ok(result.toLowerCase().includes('blue'));
});
