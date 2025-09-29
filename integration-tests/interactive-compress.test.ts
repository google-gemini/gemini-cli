/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import type * as pty from '@lydell/node-pty';

function stripAnsi(str: string): string {
  const ansiRegex = new RegExp(
    // eslint-disable-next-line no-control-regex
    '[\\u001B\\u009B][[\\]()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]',
    'g',
  );
  return str.replace(ansiRegex, '');
}

// Simulates typing a string one character at a time to avoid paste detection.
async function type(ptyProcess: pty.IPty, text: string, delay = 5) {
  for (const char of text) {
    ptyProcess.write(char);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

describe('Interactive Mode', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should trigger chat compression with /compress command', async () => {
    await rig.setup('interactive-compress-test');
    process.env['VERBOSE'] = 'true';
    const { ptyProcess } = rig.runInteractive();

    // 1. Wait for the app to be ready
    let fullOutput = '';
    ptyProcess.onData((data) => (fullOutput += data));
    const isReady = await rig.poll(
      () => stripAnsi(fullOutput).includes('Type your message'),
      15000,
      200,
    );
    expect(isReady, 'CLI did not start up in interactive mode correctly').toBe(
      true,
    );

    const longPrompt =
      'Dont do anything except returning a long paragragh with the <name of the scientist who discovered theory of relativity> at the end to indicate end of response. This is a moderately long sentence designed to exceed the very low compression threshold we have set for this specific test case. This is a moderately long sentence designed to exceed the very low compression threshold we have set for this specific test case. This is a moderately long sentence designed to exceed the very low compression threshold we have set for this specific test case. This is a moderately long sentence designed to exceed the very low compression threshold we have set for this specific test case. This is a moderately long sentence designed to exceed the very low compression threshold we have set for this specific test case. This is a moderately long sentence designed to exceed the very low compression threshold we have set for this specific test case. This is a moderately long sentence designed to exceed the very low compression threshold we have set for this specific test case. This is a moderately long sentence designed to exceed the very low compression threshold we have set for this specific test case. This is a moderately long sentence designed to exceed the very low compression threshold we have set for this specific test case.';

    await type(ptyProcess, longPrompt);
    await type(ptyProcess, '\r');

    await rig.poll(
      () => stripAnsi(fullOutput).toLowerCase().includes('einstein'),
      25000,
      200,
    );

    await type(ptyProcess, '/compress');
    // Add a small delay to allow React to re-render the command list.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await type(ptyProcess, '\r');

    const foundEvent = await rig.waitForTelemetryEvent(
      'chat_compression',
      120000,
    );
    expect(foundEvent, 'chat_compression telemetry event was not found').toBe(
      true,
    );
  });

  it('should handle compression failure on token inflation', async () => {
    await rig.setup('interactive-compress-test');
    process.env['VERBOSE'] = 'true';
    const { ptyProcess } = rig.runInteractive();

    // 1. Wait for the app to be ready
    let fullOutput = '';
    ptyProcess.onData((data) => (fullOutput += data));
    const isReady = await rig.poll(
      () => stripAnsi(fullOutput).includes('Type your message'),
      15000,
      200,
    );
    expect(isReady, 'CLI did not start up in interactive mode correctly').toBe(
      true,
    );

    await type(
      ptyProcess,
      'return only the name of the scientist who discovered theory of relativity',
    );
    await type(ptyProcess, '\r');

    await rig.poll(
      () => stripAnsi(fullOutput).toLowerCase().includes('einstein'),
      25000,
      200,
    );

    await type(ptyProcess, '/compress');
    await new Promise((resolve) => setTimeout(resolve, 100));
    await type(ptyProcess, '\r');

    const foundEvent = await rig.waitForTelemetryEvent(
      'chat_compression',
      120000,
    );
    expect(foundEvent).toBe(true);

    // A simple check for the failure message in the output
    expect(stripAnsi(fullOutput).toLowerCase()).toContain(
      'compression was not beneficial',
    );
  });
});
