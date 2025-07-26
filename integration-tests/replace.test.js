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
  const testFile = rig.createFile(fileName, 'original content');
  const prompt = `Can you replace 'original' with 'replaced' in the file 'file_to_replace.txt'`;

  const cliPromise = rig.run(prompt);

  const toolCall = await rig.waitForToolCall('replace');
  assert.deepEqual(toolCall, {
    tool_name: 'replace',
    args: {
      file_path: testFile,
      old_string: 'original',
      new_string: 'replaced',
    },
  });

  await cliPromise;
  const newFileContent = rig.readFile(fileName);
  assert.strictEqual(newFileContent, 'replaced content');
});
