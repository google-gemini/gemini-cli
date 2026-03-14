/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import { TestRig } from '@google/gemini-cli-test-utils';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import stripAnsi from 'strip-ansi';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe.skipIf(process.platform === 'win32')('Voice Whisper PTY repro', () => {
  let rig: TestRig | undefined;

  afterEach(async () => {
    await rig?.cleanup();
  });

  it('repro: whisper can remain stuck in "Speak now..." after Esc in a real PTY session', async () => {
    const fakeResponsesPath = path.join(
      __dirname,
      '../test-utils/fixtures/simple.responses',
    );

    rig = new TestRig();
    rig.setup('voice-whisper-pty-repro', {
      fakeResponsesPath,
    });

    const ignoreSigintScript = rig.createScript(
      'ignore-sigint.js',
      [
        "process.on('SIGINT', () => {});",
        'setInterval(() => {}, 1000);',
        '',
      ].join('\n'),
    );

    rig.createScript(
      'sox',
      [
        '#!/usr/bin/env bash',
        `exec "${process.execPath}" "${ignoreSigintScript}" "$@"`,
        '',
      ].join('\n'),
    );

    // Make the fake recorder executable.
    const fs = await import('node:fs/promises');
    await fs.chmod(path.join(rig.testDir!, 'sox'), 0o755);

    const run = await rig.runInteractive({
      env: {
        PATH: `${rig.testDir}:${process.env['PATH'] ?? ''}`,
        GEMINI_API_KEY: 'test-key',
      },
    });

    const submitCommand = async (command: string) => {
      await run.sendKeys(command);
      await new Promise((resolve) => setTimeout(resolve, 75));
      await run.sendKeys('\r');
    };

    await submitCommand('/voice provider whisper');
    await run.expectText('Voice transcription backend set to: whisper', 10000);

    await submitCommand('/voice enable');
    await run.expectText('Voice input enabled', 10000);

    await run.sendText(' ');
    await new Promise((resolve) => setTimeout(resolve, 120));
    await run.sendText(' ');
    await run.expectText('Speak now...', 10000);

    await run.sendText('\u001B');
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(stripAnsi(run.output)).toContain('Speak now...');
  }, 60000);
});
