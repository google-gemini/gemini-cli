/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

test('replaces specific text content in a file', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);

  const targetFile = 'file_to_replace.txt';
  const originalContent = 'original content';
  const expectedContent = 'replaced content';
  const replacementPrompt = `Please replace the word 'original' with 'replaced' in the file '${targetFile}'`;

  rig.createFile(targetFile, originalContent);

  await rig.run(replacementPrompt);

  const updatedContent = rig.readFile(targetFile);
  assert.strictEqual(updatedContent, expectedContent);
});
