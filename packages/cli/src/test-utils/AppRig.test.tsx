/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach, expect } from 'vitest';
import { act } from 'react';
import { AppRig } from './AppRig.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { debugLogger } from '@google/gemini-cli-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('AppRig', () => {
  let rig: AppRig | undefined;

  afterEach(async () => {
    await rig?.unmount();
  });

  it('should handle deterministic tool turns with breakpoints', async () => {
    const fakeResponsesPath = path.join(
      __dirname,
      'fixtures',
      'steering.responses',
    );
    rig = new AppRig({
      fakeResponsesPath,
      configOverrides: { modelSteering: true },
    });
    await rig.initialize();
    rig.render();
    await rig.waitForIdle();

    // Set breakpoints on the canonical tool names
    rig.setBreakpoint('list_directory');
    rig.setBreakpoint('read_file');

    // Start a task
    debugLogger.log('[Test] Sending message: Start long task');
    await rig.sendMessage('Start long task');

    // Wait for the first breakpoint (list_directory)
    const pending1 = await rig.waitForPendingConfirmation('list_directory');
    expect(pending1.toolName).toBe('list_directory');

    // Injected a hint
    await rig.addUserHint('focus on .txt');

    // Resolve and wait for the NEXT breakpoint (read_file)
    // resolveTool will automatically remove the breakpoint policy for list_directory
    await rig.resolveTool('list_directory');

    const pending2 = await rig.waitForPendingConfirmation('read_file');
    expect(pending2.toolName).toBe('read_file');

    // Resolve and finish. Also removes read_file breakpoint.
    await rig.resolveTool('read_file');
    await rig.waitForOutput('Task complete.', 100000);
  });

  it('should render the app and handle a simple message', async () => {
    const fakeResponsesPath = path.join(
      __dirname,
      'fixtures',
      'simple.responses',
    );
    rig = new AppRig({ fakeResponsesPath });
    await rig.initialize();
    await act(async () => {
      rig!.render();
      // Allow async initializations (like banners) to settle within the act boundary
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Wait for initial render
    await rig.waitForIdle();

    // Type a message
    await rig.type('Hello');
    await rig.pressEnter();

    // Wait for model response
    await rig.waitForOutput('Hello! How can I help you today?');
  });
});
