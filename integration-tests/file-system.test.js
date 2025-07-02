/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { strict as assert } from 'assert';
import { test } from 'node:test';
import { TestRig } from './test-helper.js';

test('reads a file', (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  rig.createFile('test.txt', 'hello world');

  const output = rig.run(`read the file name test.txt`);

  assert.ok(output.toLowerCase().includes('hello world'));
});

test('writes a file', (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  rig.createFile('test.txt', '');

  rig.run(`edit test.txt to have a hello world message`);

  const fileContent = rig.readFile('test.txt');
  assert.equal(fileContent.toLowerCase(), 'hello world message');
});

test('replaces text in a file', (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  rig.createFile('replace_test.txt', 'This is the original text.');

  rig.run(`replace "original text" with "modified text" in replace_test.txt`);

  const fileContent = rig.readFile('replace_test.txt');
  assert.equal(fileContent, 'This is the modified text.');
});
