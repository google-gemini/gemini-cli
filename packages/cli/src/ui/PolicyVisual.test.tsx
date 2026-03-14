/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppRig } from '../test-utils/AppRig.js';
import { PolicyDecision } from '@google/gemini-cli-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Policy Engine Visual Validation', () => {
  let rig: AppRig;

  beforeEach(async () => {
    const fakeResponsesPath = path.join(
      __dirname,
      '../test-utils/fixtures/policy-test.responses',
    );
    rig = new AppRig({
      fakeResponsesPath,
    });
    await rig.initialize();
  });

  afterEach(async () => {
    await rig.unmount();
  });

  it('should boot correctly and display the main interface', async () => {
    rig.render();
    await rig.waitForIdle();
    expect(rig.lastFrame).toContain('Type your message');
  });

  it.todo(
    'should visually render a DENY decision when a tool is blocked',
    async () => {
      rig.setToolPolicy('read_file', PolicyDecision.DENY);
      rig.render();

      await rig.sendMessage('Read secret.txt');

      // Wait for the model's initial text response
      await rig.waitForOutput(/I am going to read the secret file/i);

      // Wait for the blocked message to appear
      await rig.waitForOutput(/Blocked by policy/i);

      // Verify it matches the SVG snapshot
      await expect(rig).toMatchSvgSnapshot();
    },
  );

  it.todo(
    'should visually render an ASK_USER prompt for policy approval',
    async () => {
      rig.setToolPolicy('read_file', PolicyDecision.ASK_USER);
      rig.render();

      await rig.sendMessage('Read secret.txt');

      // Wait for the model's initial text response
      await rig.waitForOutput(/I am going to read the secret file/i);

      // Wait for the confirmation prompt
      await rig.waitForOutput(/Allow execution/i);

      // Verify it matches the SVG snapshot
      await expect(rig).toMatchSvgSnapshot();
    },
  );
});
