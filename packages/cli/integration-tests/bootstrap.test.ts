/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from '@google/gemini-cli-test-utils';

describe('Gemini CLI TTY Bootstrap', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
    rig.setup('TTY Bootstrap Smoke Test');
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should render the interactive UI and display the ready marker in a TTY', async () => {
    // Spawning the CLI in a pseudo-TTY with a dummy API key to bypass auth prompt
    const run = await rig.runInteractive({
      env: { GEMINI_API_KEY: 'dummy-key' },
    });

    // The ready marker we expect to see
    const readyMarker = 'Type your message or @path/to/file';
    const welcomeMessage = 'Welcome to Gemini CLI!';

    // Verify the initial render completes and displays the markers
    await run.expectText(welcomeMessage, 30000);
    await run.expectText(readyMarker, 30000);

    // If we reached here, the smoke test passed
    await run.kill();
  });
});
