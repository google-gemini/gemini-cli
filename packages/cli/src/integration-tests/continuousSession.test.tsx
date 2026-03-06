/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'vitest';
import { AppRig } from '../test-utils/AppRig.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PolicyDecision } from '@google/gemini-cli-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Continuous Session Integration', () => {
  let rig: AppRig | undefined;

  afterEach(async () => {
    await rig?.unmount();
  });

  it('should handle checkpoint_state and manual compress tools correctly', async () => {
    const fakeResponsesPath = path.join(
      __dirname,
      '../test-utils/fixtures/continuous_session.responses',
    );
    rig = new AppRig({
      fakeResponsesPath,
    });
    await rig.initialize();
    rig.render();
    await rig.waitForIdle();

    // Set policies to AUTO so it proceeds without asking user
    rig.setToolPolicy('checkpoint_state', PolicyDecision.ALLOW);
    rig.setToolPolicy('compress', PolicyDecision.ALLOW);

    // Start the quest
    await rig.type('Start the mission');
    await rig.pressEnter();

    // 1. Wait for CheckpointState tool call
    await rig.waitForOutput('CheckpointState');

    // 2. Wait for Compress tool call
    await rig.waitForOutput('Compress');

    // 3. Wait for final model response after compression
    await rig.waitForOutput('Compression successful.');
  });
});
