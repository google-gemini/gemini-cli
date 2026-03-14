/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach, beforeEach, vi } from 'vitest';
import { AppRig } from '../test-utils/AppRig.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PolicyDecision } from '@google/gemini-cli-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Model Steering Integration', () => {
  let rig: AppRig | undefined;

  beforeEach(() => {
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', '');
  });

  afterEach(async () => {
    await rig?.unmount();
  });

  it('should steer the model using a hint during a tool turn', async () => {
    const fakeResponsesPath = path.join(
      __dirname,
      '../test-utils/fixtures/steering.responses',
    );
    rig = new AppRig({
      fakeResponsesPath,
      configOverrides: { modelSteering: true },
    });
    await rig.initialize();
    rig.render();
    await rig.waitForIdle();

    rig.setToolPolicy('list_directory', PolicyDecision.ASK_USER);
    rig.setToolPolicy('read_file', PolicyDecision.ASK_USER);

    rig.setMockCommands([
      // First model turn: list_directory
      {
        pattern: /list_directory/,
        response: {
          decide: {
            toolName: 'list_directory',
            decision: PolicyDecision.ACCEPT,
          },
        },
      },
      // Second model turn: read_file
      {
        pattern: /read_file/,
        response: {
          decide: {
            toolName: 'read_file',
            decision: PolicyDecision.ACCEPT,
          },
        },
      },
    ]);

    // Start the turn
    await rig.type('read file1.txt');

    // Wait for the hint to appear
    await rig.waitForOutput('Enter a hint');

    // Enter hint to steer toward read_file instead of whatever else
    await rig.type('Please read file1.txt');

    // Verify model moved to read_file
    await rig.waitForOutput(/I will read file1.txt/);
    await rig.waitForOutput('ReadFile');

    // Resolve read_file (Proceed)
    await rig.resolveTool('ReadFile');

    // Wait for final completion
    await rig.waitForOutput('Task complete.');
  });
});
