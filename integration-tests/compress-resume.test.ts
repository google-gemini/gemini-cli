/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { join } from 'node:path';
import * as fs from 'node:fs';

describe('compress-then-resume', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should resume a compressed session using the compression marker', async () => {
    await rig.setup('compress-then-resume', {
      fakeResponsesPath: join(import.meta.dirname, 'compress-resume.responses'),
      settings: {
        general: {
          enableAutoUpdate: false,
          enableAutoUpdateNotification: false,
        },
      },
    });

    // 1. Interactive run: send a message, then compress
    const run = await rig.runInteractive();

    await run.sendKeys(
      'Write a 200 word story about a robot. The story MUST end with the text THE_END followed by a period.',
    );
    await run.type('\r');

    await run.expectText('THE_END.', 30000);

    // Trigger compression
    await run.type('/compress');
    await run.type('\r');

    await run.expectText('Chat history compressed', 90000);

    // Exit the interactive session
    await run.type('/quit');
    await run.type('\r');
    await run.expectExit();

    // Verify the session file contains a compression_marker
    const homeDir = rig.homeDir!;
    const tmpDir = join(homeDir, '.gemini', 'tmp');
    const allDirs = fs.readdirSync(tmpDir, { recursive: true }).map(String);
    const chatFiles = allDirs.filter(
      (f) => f.includes('chats') && f.endsWith('.json'),
    );
    expect(chatFiles.length).toBeGreaterThan(0);

    const sessionFilePath = join(tmpDir, chatFiles[0]);
    const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
    const hasMarker = sessionData.messages.some(
      (m: { type: string }) => m.type === 'compression_marker',
    );
    expect(
      hasMarker,
      'Session file should contain a compression_marker after /compress',
    ).toBe(true);

    // 2. Non-interactive run: resume the session
    const result = await rig.run({
      args: ['--resume', 'latest', 'What did we talk about?'],
    });

    // The resumed session should work without errors
    // (no context overflow, no crash)
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });
});
