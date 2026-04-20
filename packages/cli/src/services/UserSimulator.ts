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
import * as path from 'node:path';

interface SimulatorResponse {
  action?: string;
  thought?: string;
  used_knowledge?: boolean;
  new_rule?: string;
}

export class UserSimulator {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private lastScreenContent = '';
  private isProcessing = false;
  private interactionsFile: string | null = null;

  private knowledgeBase = '';
  private editableKnowledgeFile: string | null = null;
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
    const source = this.config.getKnowledgeSource?.();
    if (source) {
      if (!fs.existsSync(source)) {
        try {
          fs.mkdirSync(path.dirname(source), { recursive: true });
          fs.writeFileSync(source, '', 'utf8');
        } catch (e) {
          debugLogger.error(`Failed to create knowledge file at ${source}`, e);
        }
      }
      this.editableKnowledgeFile = source;
      this.loadKnowledge(source);
    }
    this.interactionsFile = `interactions_${Date.now()}.txt`;
    this.isRunning = true;
    this.timer = setInterval(() => this.tick(), 3000);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    debugLogger.log('User simulator stopped');
  }

  private loadKnowledge(p: string) {
    try {
      if (!fs.existsSync(p)) return;
      const stats = fs.statSync(p);
      if (stats.isFile()) {
        const content = fs.readFileSync(p, 'utf-8');
        if (content.trim()) {
          this.knowledgeBase = content + '\n';
        }
      }
    } catch (e) {
      debugLogger.error(`Failed to load knowledge from ${p}`, e);
    }
  }

  private async tick() {
    if (!this.isRunning || this.isProcessing) return;

    try {
      this.isProcessing = true;
      const screen = this.getScreen();
      if (!screen) return;

      const strippedScreen = screen
        .replace(
          // eslint-disable-next-line no-control-regex
          /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
          '',
        )
        .replace(/\n([ \t]*\n)+/g, '\n\n');

      const normalizedScreen = strippedScreen
        .replace(/[\u2800-\u28FF]/g, '')
        .replace(/[|/-\\]/g, '')
        .replace(/\b\d+(\.\d+)?s\b/g, '')
        .replace(/\b\d+m(\s+\d+s)?\b/g, '')
        .replace(/\(\s*\)/g, '')
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

      const knowledgeInstruction = this.knowledgeBase
        ? `\nUser Knowledge Base:\nUse this information to answer questions if applicable. If the answer is not here, respond as you normally would.\n${this.knowledgeBase}\n`
        : '';

      const historyInstruction =
        this.actionHistory.length > 0
          ? `\nRecent Simulator Actions (last 10):\n${this.actionHistory
              .slice(-10)
              .map((a, i) => `${i + 1}. ${JSON.stringify(a)}`)
              .join('\n')}\n`
          : '';

      const prompt = `You are evaluating a CLI agent by simulating a user sitting at the terminal.
Look carefully at the screen and determine the CLI's current state:

STATE 1: The agent is busy (e.g., streaming a response, showing a spinner, running a tool, or displaying a timer like "7s"). It is actively working and NOT waiting for text input.
- In this case, your action MUST be exactly: <WAIT>

STATE 2: The agent is waiting for you to authorize a tool, confirm an action, or answer a specific multi-choice question (e.g., "Action Required", "Allow execution", numbered options).
- In this case, your action MUST be the exact raw characters to select the option and submit it (e.g., 1\\r, 2\\r, y\\r, n\\r, or just \\r if the default option is acceptable). Do NOT output <DONE> or "Thank you". You must unblock the agent and allow it to run the tool.

STATE 3: The agent has finished its current thought process AND is idle, waiting for a NEW general text prompt (usually indicated by a "> Type your message" prompt).
- First, verify that the ACTUAL task is fully complete based on your original goal. Do not stop at intermediate steps like planning or syntax checking.
- If the task is indeed fully complete, your action should be "Thank you\\r" to graciously finish the simulation.
- If you have already said thank you, your action MUST be exactly: <DONE>
- If the agent is waiting at a general text prompt but the original task is NOT complete, provide text instructions to continue what is missing. DO NOT repeat the original goal if it has already been provided once. Ask it to continue or provide feedback based on the current state or send <DONE> if you think the task is completed.

STATE 4: Any other situation where the agent is waiting for text input or needs to press Enter.
- Your action should be the raw characters you would type, followed by \\r. For just an Enter key press, output \\r.

CRITICAL RULES:
- RULE 1: If there is ANY active spinner (e.g., ⠋, ⠙, ⠹, ⠸, ⠼, ⠴, ⠧) or an elapsed time indicator (e.g., "0s", "7s") anywhere on the screen, the agent is STILL WORKING. Your action MUST be <WAIT>. Do NOT issue commands, even if a text prompt is visible below it.
- RULE 2: If there is an "Action Required" or confirmation prompt on the screen, YOU MUST HANDLE IT (State 2). This takes precedence over everything else.
- RULE 3: You MUST output a strictly formatted JSON object with no markdown wrappers or extra text.

JSON FORMAT:
{
  "action": "<The exact raw characters to send, <WAIT>, or <DONE>>",
  "used_knowledge": <true if you used the User Knowledge Base below to answer this prompt, false otherwise>,
  "new_rule": "<If used_knowledge is false and action is not <WAIT> or <DONE>, formulate a single, clear, reusable one-line rule combining the question and your answer without using option numbers (e.g. 1, 2) that might change. For example: 'If asked to allow pip execution, always allow it.' or 'Automatically accept edits for snake game implementation.'>"
}
${goalInstruction}${knowledgeInstruction}${historyInstruction}

Here is the current terminal screen output:

<screen>
${strippedScreen}
</screen>`;

      if (this.interactionsFile) {
        fs.appendFileSync(
          this.interactionsFile,
          `[LOG] [SIMULATOR] Prompt Used:\n---\n${prompt}\n---\n\n`,
        );
      }

      const model = resolveModel(
        PREVIEW_GEMINI_FLASH_MODEL,
        false, // useGemini3_1
        false, // useGemini3_1FlashLite
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

      let responseText = '';
      let parsedJson: SimulatorResponse = {};
      try {
        let cleanJson = response.text || '';
        const startIdx = cleanJson.indexOf('{');
        const endIdx = cleanJson.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          cleanJson = cleanJson.substring(startIdx, endIdx + 1);
        } else {
          cleanJson = cleanJson.replace(/^```json\s*|\s*```$/gm, '').trim();
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        parsedJson = JSON.parse(cleanJson) as SimulatorResponse;
        responseText = parsedJson.action || '';
      } catch (err) {
        debugLogger.error('Failed to parse simulator response as JSON', err);
        const text = (response.text || '').trim();
        if (
          text === '<WAIT>' ||
          text === '<DONE>' ||
          /^\d+\\r$/.test(text) ||
          text === '\\r'
        ) {
          responseText = text.replace(/^[`"']+|[`"']+$/g, '');
        } else {
          responseText = ''; // Prevent typing broken JSON string
        }
      }

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
        this.actionHistory.push('<WAIT>');
        if (this.interactionsFile) {
          fs.appendFileSync(
            this.interactionsFile,
            `[LOG] [SIMULATOR] Action History updated with: "<WAIT>"\n\n`,
          );
        }
        this.lastScreenContent = normalizedScreen;
        return;
      }

      if (responseText) {
        const keys = responseText
          .replace(/\\n|\n/g, '\r')
          .replace(/\\r/g, '\r');

        debugLogger.log(
          `[SIMULATOR] Sending to stdin: ${JSON.stringify(keys)}`,
        );

        this.actionHistory.push(keys);
        if (this.interactionsFile) {
          fs.appendFileSync(
            this.interactionsFile,
            `[LOG] [SIMULATOR] Action History updated with: ${JSON.stringify(keys)}\n\n`,
          );
        }

        if (
          !parsedJson.used_knowledge &&
          parsedJson.new_rule &&
          this.editableKnowledgeFile
        ) {
          const newKnowledge = `- ${parsedJson.new_rule}\n`;
          this.knowledgeBase += newKnowledge;
          try {
            fs.appendFileSync(this.editableKnowledgeFile, newKnowledge);
            debugLogger.log(
              `[SIMULATOR] Saved new knowledge to ${this.editableKnowledgeFile}`,
            );
            if (this.interactionsFile) {
              fs.appendFileSync(
                this.interactionsFile,
                `[LOG] [SIMULATOR] Saved new knowledge to ${this.editableKnowledgeFile}\n\n`,
              );
            }
          } catch (e) {
            debugLogger.error(`Failed to append knowledge`, e);
          }
        }

        for (const char of keys) {
          if (char === '\r') {
            // Wait a bit to ensure the previous character is rendered before submitting
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          this.stdinBuffer.write(char);
          // Small delay to ensure Ink processes each keypress event individually
          // while preventing UI state collisions during long simulated inputs.
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        this.lastScreenContent = normalizedScreen;
      } else {
        debugLogger.log('[SIMULATOR] Skipping (empty response)');

        this.actionHistory.push('<EMPTY>');
        if (this.interactionsFile) {
          fs.appendFileSync(
            this.interactionsFile,
            `[LOG] [SIMULATOR] Action History updated with: "<EMPTY>"\n\n`,
          );
        }

        this.lastScreenContent = normalizedScreen;
      }
    } catch (e: unknown) {
      debugLogger.error('UserSimulator tick failed', e);
    } finally {
      this.isProcessing = false;
    }
  }
}
