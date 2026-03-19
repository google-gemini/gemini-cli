/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '@google/gemini-cli-core';
import { debugLogger, LlmRole, resolveModel } from '@google/gemini-cli-core';
import type { Writable } from 'node:stream';

export class UserSimulator {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private lastScreenContent = '';
  private isProcessing = false;

  constructor(
    private readonly config: Config,
    private readonly getScreen: () => string | undefined,
    private readonly stdinBuffer: Writable,
  ) {}

  start() {
    if (!this.config.getSimulateUser()) {
      return;
    }
    this.isRunning = true;
    this.timer = setInterval(() => this.tick(), 2000);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    debugLogger.log('User simulator stopped');
  }

  private async tick() {
    if (!this.isRunning || this.isProcessing) return;

    try {
      this.isProcessing = true;
      const screen = this.getScreen();
      if (!screen || screen === this.lastScreenContent) return;

      const strippedScreen = screen.replace(
        // eslint-disable-next-line no-control-regex
        /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
        '',
      );

      const contentGenerator = this.config.getContentGenerator();
      if (!contentGenerator) return;

      const prompt = `You are evaluating a CLI agent by simulating a user sitting at the terminal.
Here is the current terminal screen output:

<screen>
${strippedScreen}
</screen>

Look at the screen. Is the CLI waiting for your input (e.g., asking for tool confirmation, presenting a multi-choice question, or waiting for a text prompt with an indicator like "❯")?
If it is NOT waiting for input (e.g., it is streaming a response or showing a spinner), you MUST output exactly: <WAIT>

If it IS waiting for your input, output ONLY the exact raw characters you would type. 
Read the screen context carefully. Sometimes you may need to choose a numbered option, answer yes/no, or provide a text explanation.
For example:
- To choose an option from a multi-choice list, output the number: 1
- To answer a simple yes/no confirmation, output: y
- To provide an explanation or answer an open-ended question, output the text followed by \n: Because it is required for the project\n
- To enter a new prompt, output the text followed by \n.
Do NOT output markdown, explanations of your thought process, or quotes. Output ONLY the raw characters to send or <WAIT>.`;

      const model = resolveModel(
        this.config.getModel(),
        false, // useGemini3_1
        false, // useCustomToolModel
        this.config.getHasAccessToPreviewModel?.() ?? true,
        this.config,
      );

      const response = await contentGenerator.generateContent(
        {
          model,
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
        },
        'simulator-prompt',
        LlmRole.UTILITY_SIMULATOR,
      );

      const responseText = (response.text || '').trim();
      if (responseText && responseText !== '<WAIT>') {
        const keys = responseText.replace(/\\n/g, '\n');
        this.stdinBuffer.write(keys);
        this.lastScreenContent = screen;
      }
    } catch (e: unknown) {
      debugLogger.error('UserSimulator tick failed', e);
    } finally {
      this.isProcessing = false;
    }
  }
}
