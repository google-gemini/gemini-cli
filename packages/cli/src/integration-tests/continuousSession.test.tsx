/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach } from 'vitest';
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
      configOverrides: {
        continuousSession: true,
      },
    });
    await rig.initialize();
    rig.render();
    await rig.waitForIdle();

    // Use ASK_USER to pause and inspect the curated history at key moments
    rig.setToolPolicy('checkpoint_state', PolicyDecision.ASK_USER);
    rig.setToolPolicy('compress', PolicyDecision.ASK_USER);

    // Start the quest
    await rig.type('Start the mission ' + 'PAD'.repeat(100));
    await rig.pressEnter();

    // 1. Wait for CheckpointState tool call
    await rig.waitForOutput('CheckpointState');
    // Verify curated history BEFORE checkpoint is applied
    expect(rig.getLastSentRequestContents()).toMatchSnapshot('1-before-checkpoint');
    await rig.resolveTool('CheckpointState');

    // 2. Wait for Compress tool call
    await rig.waitForOutput('Compress');
    // Verify curated history contains the checkpoint
    expect(rig.getLastSentRequestContents()).toMatchSnapshot('2-with-checkpoint');
    await rig.resolveTool('Compress');

    // 3. Wait for final model response after compression
    await rig.waitForOutput('Compression successful.');
    await rig.waitForIdle();

    // Verify the final curated history:
    // - Should contain the high-fidelity snapshot
    // - Should NOT contain pre-compression turns
    expect(rig.getCuratedHistory()).toMatchSnapshot('final-curated-history');
  });
});
