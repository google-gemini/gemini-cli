/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppRig } from '../test-utils/AppRig.js';
import { PolicyDecision } from '@google/gemini-cli-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Distill Result Integration', () => {
  let rig: AppRig | undefined;

  afterEach(async () => {
    await rig?.unmount();
  });

  it('should surgically replace a noisy tool result with a distilled version', async () => {
    const fakeResponsesPath = path.resolve(
      __dirname,
      '../test-utils/fixtures/distill_result.responses',
    );
    
    rig = new AppRig({
      fakeResponsesPath,
      configOverrides: { 
        continuousSession: true,
        modelSteering: true,
      },
    });
    
    await rig.initialize();
    rig.render();
    await rig.waitForIdle();

    rig.setMockCommands([
      {
        command: /read_file/,
        result: {
          output: 'NOISE\n'.repeat(50) + 'SECRET_KEY="12345"\n' + 'NOISE\n'.repeat(50),
          exitCode: 0,
        },
      },
    ]);

    // Use ASK_USER to pause and inspect the request before each model turn
    rig.setToolPolicy('read_file', PolicyDecision.ASK_USER);
    rig.setToolPolicy('distill_result', PolicyDecision.ASK_USER);

    // 1. Initial Prompt: Audit for secrets
    await rig.sendMessage('Audit src/ for secrets');

    // 2. Model calls run_shell_command (the "Noise Bomb")
    await rig.waitForOutput('ReadFile');
    // Verify the curated history sent to model contains the initial user prompt
    expect(rig.getLastSentRequestContents()).toMatchSnapshot('1-initial-prompt');
    
    await rig.resolveTool('ReadFile');
    
    // 3. Model realizes it's noisy and calls distill_result
    await rig.waitForOutput('DistillResult');
    // Verify history now includes the massive noise
    expect(rig.getLastSentRequestContents()).toMatchSnapshot('2-request-with-noise');
    
    await rig.resolveTool('DistillResult');

    // 4. Model continues from the distilled state and finishes
    await rig.waitForOutput(/found the SECRET_KEY/i);
    await rig.waitForIdle();

    // Verify the final curated history:
    // - NO noise from the original read_file
    // - original read_file response is replaced with our universal distillation schema
    // - intermediate thoughts and the distill_result turn itself are elided
    expect(rig.getCuratedHistory()).toMatchSnapshot('final-curated-history');

    // Verify final output contains the signal
    const output = rig.getStaticOutput();
    expect(output).toContain('SECRET_KEY');
    expect(output).toContain('12345');
  });
});
