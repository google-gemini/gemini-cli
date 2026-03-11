/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { AppRig } from '../test-utils/AppRig.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PolicyDecision } from '@google/gemini-cli-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Auto-distillation Integration', () => {
  let rig: AppRig | undefined;

  afterEach(async () => {
    if (rig) {
      await rig.unmount();
    }
    vi.restoreAllMocks();
  });

  it('should truncate and summarize massive tool outputs, and we should golden the chat history', async () => {
    const fakeResponsesPath = path.join(
      __dirname,
      '../test-utils/fixtures/auto-distillation.responses',
    );
    rig = new AppRig({
      fakeResponsesPath,
    });

    await rig.initialize();

    const config = rig.getConfig();
    // 50 chars threshold. > 75 chars triggers summarization
    vi.spyOn(config, 'getTruncateToolOutputThreshold').mockReturnValue(50);

    rig.setToolPolicy('run_shell_command', PolicyDecision.ASK_USER);

    rig.setMockCommands([
      {
        command: /cat large.txt/,
        result: {
          output: 'A'.repeat(100),
          exitCode: 0,
        },
      },
    ]);

    rig.render();
    await rig.waitForIdle();

    await rig.sendMessage('Fetch the massive file.');

    await rig.waitForOutput('Shell');
    await rig.resolveTool('Shell');

    await rig.waitForOutput('Task complete.');

    expect(rig.getCuratedHistory()).toMatchSnapshot();
  });
});
