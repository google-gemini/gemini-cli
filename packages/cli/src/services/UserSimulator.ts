/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '@google/gemini-cli-core';
import {
  debugLogger,
  LlmRole,
  PREVIEW_GEMINI_FLASH_MODEL,
  resolveModel,
} from '@google/gemini-cli-core';
import type { Writable } from 'node:stream';
import * as fs from 'node:fs';

export class UserSimulator {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private lastScreenContent = '';
  private isProcessing = false;
  private interactionsFile: string | null = null;
  private actionHistory: string[] = [];

  constructor(
    private readonly config: Config,
    private readonly getScreen: () => string | undefined,
    private readonly stdinBuffer: Writable,
  ) {}

  start() {
    if (!this.config.getSimulateUser()) {
      return;
    }
    this.interactionsFile = `interactions_${Date.now()}.txt`;
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
      if (!screen) return;

      const strippedScreen = screen.replace(
        // eslint-disable-next-line no-control-regex
        /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
        '',
      );

      const normalizedScreen = strippedScreen
        .replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g, '')
        .replace(/\[?\s*\b\d+(\.\d+)?s\b\s*\]?/g, '')
        .trim();

      if (normalizedScreen === this.lastScreenContent) return;

      debugLogger.log(
        `[SIMULATOR] Screen Content Seen:\n---\n${strippedScreen}\n---`,
      );
      if (this.interactionsFile) {
        fs.appendFileSync(
          this.interactionsFile,
          `[LOG] [SIMULATOR] Screen Content Seen:\n---\n${strippedScreen}\n---\n\n`,
        );
      }

      const contentGenerator = this.config.getContentGenerator();
      if (!contentGenerator) return;

      const originalGoal = this.config.getQuestion();
      const goalInstruction = originalGoal
        ? `\nThe original goal was: "${originalGoal}"\n`
        : '';

      const historyInstruction =
        this.actionHistory.length > 0
          ? `\nYou have previously taken the following actions (in order):\n${this.actionHistory.map((a, i) => `${i + 1}. ${JSON.stringify(a)}`).join('\n')}\nPay close attention to whether you have already asked for the original goal. If you have already submitted the original goal, DO NOT repeat it verbatim. If the UI shows your typed text but hasn't submitted it yet, just output \\r to press Enter.\n`
          : '';

      const prompt = `You are evaluating a CLI agent by simulating a user sitting at the terminal.
Here is the current terminal screen output:

<screen>
${strippedScreen}
</screen>
Look carefully at the screen and determine the CLI's current state:

STATE 1: The agent is busy (e.g., streaming a response, showing a spinner, running a tool, or displaying a timer like "7s"). It is actively working and NOT waiting for text input.
- In this case, you MUST output exactly: <WAIT>

STATE 2: The agent is waiting for you to authorize a tool, confirm an action, or answer a specific multi-choice question (e.g., "Action Required", "Allow execution", numbered options).
- In this case, you MUST output the exact raw characters to select the option and submit it (e.g., 1\\r, 2\\r, y\\r, n\\r, or just \\r if the default option is acceptable). Do NOT output <DONE> or "Thank you". You must unblock the agent and allow it to run the tool.

STATE 3: The agent has finished its current thought process AND is idle, waiting for a NEW general text prompt (usually indicated by a "> Type your message" prompt).
- First, verify that the ACTUAL task is fully complete based on your original goal. Do not stop at intermediate steps like planning or syntax checking.
- If the task is indeed fully complete, output "Thank you\\r" to graciously finish the simulation.
- If you have already said thank you, output exactly: <DONE>
- If the agent is waiting at a general text prompt but the original task is NOT complete, provide text instructions to continue what is missing. DO NOT repeat the original goal if it has already been provided once. Ask it to continue or provide feedback based on the current state or send <DONE> if you think the task is completed.

STATE 4: Any other situation where the agent is waiting for text input or needs to press Enter.
- Output the raw characters you would type, followed by \\r. For just an Enter key press, output \\r.

CRITICAL RULES:
- RULE 1: If there is ANY active spinner (e.g., ⠋, ⠙, ⠹, ⠸, ⠼, ⠴, ⠧) or an elapsed time indicator (e.g., "0s", "7s") anywhere on the screen, the agent is STILL WORKING. You MUST output <WAIT>. Do NOT issue commands, even if a text prompt is visible below it.
- RULE 2: If there is an "Action Required" or confirmation prompt on the screen, YOU MUST HANDLE IT (State 2). This takes precedence over everything else.
- RULE 3: Output ONLY the raw characters to send, <WAIT>, or <DONE>.
- RULE 4: Do NOT output markdown, explanations of your thought process, or quotes.
${goalInstruction}${historyInstruction}`;

      if (this.interactionsFile) {
        fs.appendFileSync(
          this.interactionsFile,
          `[LOG] [SIMULATOR] Prompt Used:\n---\n${prompt}\n---\n\n`,
        );
      }

      const model = resolveModel(
        PREVIEW_GEMINI_FLASH_MODEL,
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
      if (this.interactionsFile) {
        fs.appendFileSync(
          this.interactionsFile,
          `[LOG] [SIMULATOR] Raw model response: ${JSON.stringify(response.text)}\n\n`,
        );
      }
      debugLogger.log(
        `[SIMULATOR] Processed response: ${JSON.stringify(responseText)}`,
      );

      if (trimmedResponse === '<DONE>') {
        const msg = '[SIMULATOR] Terminating simulation: Task is completed.';
        debugLogger.log(msg);
        if (this.interactionsFile) {
          fs.appendFileSync(this.interactionsFile, `[LOG] ${msg}\n\n`);
        }
        // eslint-disable-next-line no-console
        console.log(`\n${msg}`);
        this.stop();
        process.exit(0);
      }

      if (trimmedResponse === '<WAIT>') {
        debugLogger.log(
          '[SIMULATOR] Skipping action (model decided to <WAIT>)',
        );
        this.lastScreenContent = normalizedScreen;
        return;
      }

      if (responseText) {
        const keys = responseText.replace(/\\n/g, '\r').replace(/\\r/g, '\r');
        const readableAction = trimmedResponse.replace(/\\r/g, '[ENTER]');
        this.actionHistory.push(readableAction);

        debugLogger.log(
          `[SIMULATOR] Sending to stdin: ${JSON.stringify(keys)}`,
        );
        this.stdinBuffer.write(keys);
        this.lastScreenContent = normalizedScreen;
      } else {
        debugLogger.log('[SIMULATOR] Skipping (empty response)');
        this.lastScreenContent = normalizedScreen;
      }
    } catch (e: unknown) {
      debugLogger.error('UserSimulator tick failed', e);
    } finally {
      this.isProcessing = false;
    }
  }
}
