/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

test.skip('should be able to read multiple files', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  rig.createFile('file1.txt', 'file 1 content');
  rig.createFile('file2.txt', 'file 2 content');

  const prompt = `Read the files in this directory, list them and print them to the screen`;
  const result = await rig.run(prompt);

  assert.ok(result.includes('file 1 content'));
  assert.ok(result.includes('file 2 content'));
});
