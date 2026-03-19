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
  private lastResponse = '';
  private repeatCount = 0;
  private readonly MAX_REPEATS = 3;

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
    this.timer = setInterval(() => this.tick(), 1000);
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

      debugLogger.log(
        `[SIMULATOR] Screen Content Seen:\n---\n${strippedScreen}\n---`,
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

If the agent has explicitly stated that the task or implementation is complete, or is asking if there is anything else you need because it has finished its work (e.g. asking "is there anything else?"), you MUST output exactly: <DONE>

If you have already achieved your original goal (which is whatever you initially prompted the agent with) and the agent is idle, you MUST output exactly: <DONE>

If it IS waiting for your input, output ONLY the exact raw characters you would type. 
Read the screen context carefully. Sometimes you may need to choose a numbered option, answer yes/no, or provide a text explanation.
For example:
- To choose an option from a multi-choice list, output the number: 1
- To answer a simple yes/no confirmation, output: y
- To provide an explanation or answer an open-ended question, output the text followed by \\n: Because it is required for the project\\n
- To enter a new prompt, output the text followed by \\n.
Do NOT output markdown, explanations of your thought process, or quotes. Output ONLY the raw characters to send, <WAIT>, or <DONE>.`;

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

      const responseText = (response.text || '').replace(
        /^[`"']+|[`"']+$/g,
        '',
      );
      const trimmedResponse = responseText.trim();

      debugLogger.log(
        `[SIMULATOR] Raw model response: ${JSON.stringify(response.text)}`,
      );
      debugLogger.log(
        `[SIMULATOR] Processed response: ${JSON.stringify(responseText)}`,
      );

      if (trimmedResponse === '<DONE>') {
        debugLogger.log('[SIMULATOR] Detected task completion. Exiting.');
        // eslint-disable-next-line no-console
        console.log('\n[SIMULATOR] Task complete. Exiting.');
        this.stop();
        process.exit(0);
      }

      if (trimmedResponse === '<WAIT>') {
        debugLogger.log(
          '[SIMULATOR] Skipping action (model decided to <WAIT>)',
        );
        this.lastScreenContent = screen;
        return;
      }

      if (responseText) {
        if (responseText === this.lastResponse) {
          this.repeatCount++;
          debugLogger.log(
            `[SIMULATOR] Repeated response detection: ${this.repeatCount}/${this.MAX_REPEATS}`,
          );
        } else {
          this.repeatCount = 0;
        }
        this.lastResponse = responseText;

        if (this.repeatCount >= this.MAX_REPEATS) {
          debugLogger.log(
            `[SIMULATOR] Stalling detected (repeated response "${responseText}"). Stopping.`,
          );
          // eslint-disable-next-line no-console
          console.log(
            '\n[SIMULATOR] Stalling detected (repeated response). Stopping.',
          );
          this.stop();
          process.exit(0);
        }

        const keys = responseText.replace(/\\n/g, '\n');
        debugLogger.log(
          `[SIMULATOR] Sending to stdin: ${JSON.stringify(keys)}`,
        );
        this.stdinBuffer.write(keys);
        this.lastScreenContent = screen;
      } else {
        debugLogger.log('[SIMULATOR] Skipping (empty response)');
        this.lastScreenContent = screen;
      }
    } catch (e: unknown) {
      debugLogger.error('UserSimulator tick failed', e);
    } finally {
      this.isProcessing = false;
    }
  }
}
