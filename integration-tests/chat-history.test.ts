/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';

let rig: TestRig;

beforeEach(() => {
  rig = new TestRig();
});

afterEach(async () => {
  await rig.cleanup();
});

test('should save and resume chat history using tags', async () => {
  rig.setup('chat-history-tags');
  const tag = `test-session-${Date.now()}`;

  // First run: save the history
  const result1 = await rig.run(
    'What is the capital of France?',
    '--save-chat',
    tag,
  );
  expect(result1).toContain('Paris');

  // Second run: resume the history
  const result2 = await rig.run(
    'What continent is it located in?',
    '--resume-chat',
    tag,
  );
  expect(result2).toContain('Europe');
});
