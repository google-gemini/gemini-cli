/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

test('should be able to replace content in a file', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);

  const fileName = 'file_to_replace.txt';
  rig.createFile(fileName, 'original content');
  const prompt = `Can you replace 'original' with 'replaced' in the file 'file_to_replace.txt'`;

  await rig.run(prompt);
  const newFileContent = rig.readFile(fileName);
  assert.strictEqual(newFileContent, 'replaced content');
});
