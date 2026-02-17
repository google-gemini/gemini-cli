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

describe('Model Steering Integration', () => {
  let rig: AppRig | undefined;

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
      {
        command: /list_directory/,
        result: {
          output: 'file1.txt\nfile2.js\nfile3.md',
          exitCode: 0,
        },
      },
      {
        command: /read_file file1.txt/,
        result: {
          output: 'This is file1.txt content.',
          exitCode: 0,
        },
      },
    ]);

    // Start a long task
    await rig.type('Start long task');
    await rig.pressEnter();

    // Wait for the model to call 'list_directory' (Confirming state)
    await rig.waitForOutput('ReadFolder');

    // Injected a hint while the model is in a tool turn
    await rig.addUserHint('focus on .txt');

    // Resolve list_directory (Proceed)
    await rig.resolveTool('ReadFolder');

    // Wait for the model to process the hint and output the next action
    // Based on steering.responses, it should first acknowledge the hint
    await rig.waitForOutput('ACK: I will focus on .txt files now.');

    // Then it should proceed with the next action
    await rig.waitForOutput(
      /Since you want me to focus on .txt files,[\s\S]*I will read file1.txt/,
    );
    await rig.waitForOutput('ReadFile');

    // Resolve read_file (Proceed)
    await rig.resolveTool('ReadFile');

    // Wait for final completion
    await rig.waitForOutput('Task complete.');
  });
});
