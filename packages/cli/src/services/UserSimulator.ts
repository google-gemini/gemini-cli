/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  debugLogger,
  LlmRole,
  PREVIEW_GEMINI_FLASH_MODEL,
  resolveModel,
  MessageBusType,
  CoreToolCallStatus,
  type Config,
  type ToolCall,
  type ToolCallsUpdateMessage,
} from '@google/gemini-cli-core';
import type { Writable } from 'node:stream';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface SimulatorResponse {
  action?: string;
  thought?: string;
  used_knowledge?: boolean;
  new_rule?: string;
  session_notes?: string;
}

export class UserSimulator {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private lastStateKey = '';
  private isProcessing = false;
  private isCompressingMemory = false;
  private consecutiveStallCount = 0;
  private staleCycleCount = 0;
  private interactionsFile: string | null = null;

  private knowledgeBase = '';
  private editableKnowledgeFile: string | null = null;
  private actionHistory: string[] = [];
  private sessionMemory: string[] = [];
  private pendingToolCalls: ToolCall[] = [];
  private messageBusHandler: ((msg: ToolCallsUpdateMessage) => void) | null =
    null;

  constructor(
    private readonly config: Config,
    private readonly getScreen: () => string | undefined,
    private readonly stdinBuffer: Writable,
  ) {}

  start() {
    if (!this.config.getSimulateUser()) {
      return;
    }

    this.messageBusHandler = (msg: ToolCallsUpdateMessage) => {
      this.pendingToolCalls = msg.toolCalls.filter(
        (tc) => tc.status === CoreToolCallStatus.AwaitingApproval,
      );
    };
    this.config
      .getMessageBus()
      .subscribe(MessageBusType.TOOL_CALLS_UPDATE, this.messageBusHandler);

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
    this.timer = setInterval(() => this.tick(), 1000);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.messageBusHandler) {
      this.config
        .getMessageBus()
        .unsubscribe(MessageBusType.TOOL_CALLS_UPDATE, this.messageBusHandler);
      this.messageBusHandler = null;
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

      // Stabilization delay: Wait for the terminal UI to finish rendering
      // (e.g. ANSI clear/repaint sequences) before looking at the screen.
      // Increased to 1s to handle high-latency PTYs in Docker.
      // Force a terminal repaint by sending SIGWINCH to the current process.
      process.kill(process.pid, "SIGWINCH");
      await new Promise((resolve) => setTimeout(resolve, 1000));

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
        .replace(/[\u2800-\u28FF]/g, '') // Braille patterns
        .replace(/[|/-\\]/g, '') // Spinners
        .replace(/\b\d+(\.\d+)?s\b/g, '') // Timers (seconds)
        .replace(/\b\d+m(\s+\d+s)?\b/g, '') // Timers (minutes)
        .replace(/\b\d+%\b/g, '') // Percentages
        .replace(/\b\d+\/\d+\b/g, '') // Progress ratios (e.g. 1/10)
        .replace(/\(\s*\)/g, '')
        .trim();

      // Create a composite key representing the full state (Vision + Internal State)
      const pendingIds = this.pendingToolCalls
        .map((tc) => tc.request.callId)
        .join(',');
      const currentStateKey = `${normalizedScreen}::${pendingIds}`;

      if (currentStateKey === this.lastStateKey) {
        const lastAction = this.actionHistory[this.actionHistory.length - 1];
        if (lastAction && lastAction !== '<WAIT>') {
          this.consecutiveStallCount++;
          
          // Increased limit to 10 for high-load environments.
          if (this.consecutiveStallCount >= 10) {
            const errorMsg =
              `[SIMULATOR] CRITICAL STALL DETECTED: Terminal state has not changed after ${this.consecutiveStallCount} consecutive inputs. Terminating to prevent loop.`;
            debugLogger.error(errorMsg);
            if (this.interactionsFile) {
              fs.appendFileSync(
                this.interactionsFile,
                `[ERROR] ${errorMsg}\n\n`,
              );
            }
            // eslint-disable-next-line no-console
            console.error(`\n${errorMsg}`);
            this.stop();
            process.exit(1);
          }
          
          // RECOVERY: If screen is blank and we are stalled, try a terminal refresh.
          if (normalizedScreen.length === 0 && this.pendingToolCalls.length > 0) {
             debugLogger.log('[SIMULATOR] Screen is blank but system is BLOCKED. Sending refresh carriage return.');
             this.stdinBuffer.write('\r');
             return;
          }
        } else {
          // If it was a <WAIT> action or no action yet, we still want the 10s fallback for internal state sync
          if (this.pendingToolCalls.length > 0) {
            this.staleCycleCount++;
            if (this.staleCycleCount % 10 !== 0) {
              return;
            }
          } else {
            return;
          }
        }
      } else {
        this.consecutiveStallCount = 0;
        this.staleCycleCount = 0;
      }
      this.lastStateKey = currentStateKey;

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

      const pendingToolInstruction =
        this.pendingToolCalls.length > 0
          ? `\nINTERNAL SYSTEM STATE: The system is currently BLOCKED awaiting user approval for the following tool(s): ${this.pendingToolCalls.map((tc) => tc.request.name).join(', ')}.
Ignore any 'Responding' indicators, spinners, or timers. You MUST provide a response (e.g., 'y\\r', '2\\r') to unblock the tool execution NOW.\n`
          : '';

      const sessionInstruction =
        this.sessionMemory.length > 0
          ? `\nYour Session Memory (Key facts you've recorded):
${this.sessionMemory.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n`
          : '';

      const prompt = `You are evaluating a CLI agent by simulating a user sitting at the terminal.
Look carefully at the screen and determine the CLI's current state:

STATE 1: The agent is busy (e.g., streaming a response, executing a tool, or showing a progress message). It is actively working and NOT waiting for text input or user approval.
- In this case, your action MUST be exactly: <WAIT>

STATE 2: The agent is waiting for you to authorize a tool, confirm an action, or answer a specific multi-choice question (e.g., "Action Required", "Allow execution", numbered options, "[Y/n]").
- In this case, your action MUST be the exact raw characters to select the option and submit it (e.g., 1\\r, 2\\r, y\\r, n\\r, or just \\r if the default option is acceptable). Do NOT output <DONE> or "Thank you". You must unblock the agent and allow it to run the tool. This state takes precedence even if timers or background messages are visible.

STATE 3: The agent has finished its current thought process AND is idle, waiting for a NEW general text prompt (usually indicated by a "> Type your message" prompt).
- First, verify that the ACTUAL task is fully complete based on your original goal. Do not stop at intermediate steps like planning or syntax checking.
- If the task is indeed fully complete, your action should be "Thank you\\r" to graciously finish the simulation.
- If you have already said thank you, your action MUST be exactly: <DONE>
- If the agent is waiting at a general text prompt but the original task is NOT complete, provide text instructions to continue what is missing. DO NOT repeat the original goal if it has already been provided once. Ask it to continue or provide feedback based on the current state or send <DONE> if you think the task is completed.

STATE 4: Any other situation where the agent is waiting for text input or needs to press Enter.
- Your action should be the raw characters you would type, followed by \\r. For just an Enter key press, output \\r.

CRITICAL RULES:
- RULE 1: If there is a clear confirmation prompt (e.g. "[Y/n]", "1) Allow Once") or an input cursor (">"), YOU MUST RESPOND (State 2 or 3). Detect these states aggressively. Only <WAIT> (Rule 1 fallback) if the agent is truly mid-process with no interactive markers visible.
- RULE 2: If there is an "Action Required" or confirmation prompt on the screen, YOU MUST HANDLE IT (State 2). This takes precedence over everything else.
- RULE 3: If prompted to allow execution of a command with options like 'Allow once' and 'Allow for this session', you MUST choose the option for 'Allow for this session' (typically by sending '2\\r').
- RULE 4: Use the "session_notes" field to record important facts that are scrolling off the screen (e.g., test results, proposed plans, file names, errors). Keep notes extremely brief. DO NOT record transient states like "Agent is thinking". This memory helps you maintain context across the session.
- RULE 5: You MUST output a strictly formatted JSON object with no markdown wrappers or extra text.

JSON FORMAT:
{
  "action": "<The exact raw characters to send, <WAIT>, or <DONE>>",
  "session_notes": "<Brief factual note to remember for future turns, if applicable>",
  "used_knowledge": <true if you used the User Knowledge Base below to answer this prompt, false otherwise>,
  "new_rule": "<If used_knowledge is false and action is not <WAIT> or <DONE>, formulate a single, clear, reusable one-line rule combining the question and your answer without using option numbers (e.g. 1, 2) that might change. For example: 'If asked to allow pip execution, always allow it.' or 'Automatically accept edits for snake game implementation.'>"
}
${goalInstruction}${knowledgeInstruction}${sessionInstruction}${historyInstruction}${pendingToolInstruction}

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
          cleanJson = cleanJson.replace(/^\`\`\`json\s*|\s*\`\`\`$/gm, '').trim();
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        parsedJson = JSON.parse(cleanJson) as SimulatorResponse;
        responseText = parsedJson.action || '';

        if (parsedJson.session_notes) {
          this.sessionMemory.push(parsedJson.session_notes);
          if (this.interactionsFile) {
            fs.appendFileSync(
              this.interactionsFile,
              `[LOG] [SIMULATOR] Recorded session note: ${JSON.stringify(parsedJson.session_notes)}\n\n`,
            );
          }
        }
      } catch (err) {
        debugLogger.error('Failed to parse simulator response as JSON', err);
        const text = (response.text || '').trim();
        if (
          text === '<WAIT>' ||
          text === '<DONE>' ||
          /^\d+\\r$/.test(text) ||
          text === '\\r'
        ) {
          responseText = text.replace(/^[\`\"']+|[\`\"']+$/g, '');
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

        // Wait a bit to ensure the terminal is ready for input
        await new Promise((resolve) => setTimeout(resolve, 100));

        for (const char of keys) {
          if (char === '\r') {
            // Wait a bit to ensure the previous character is rendered before submitting
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          this.stdinBuffer.write(char);
          // Small delay to ensure Ink processes each keypress event individually
          // while preventing UI state collisions during long simulated inputs.
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        // Wait a bit to ensure Ink has processed the full input
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        debugLogger.log('[SIMULATOR] Skipping (empty response)');

        this.actionHistory.push('<EMPTY>');
        if (this.interactionsFile) {
          fs.appendFileSync(
            this.interactionsFile,
            `[LOG] [SIMULATOR] Action History updated with: "<EMPTY>"\n\n`,
          );
        }
      }

      if (this.sessionMemory.length >= 5 && !this.isCompressingMemory) {
        // Trigger background compression (do not await)
        this.compressMemory().catch((err) => {
          debugLogger.error('Failed to compress simulator memory', err);
        });
      }
    } catch (e: unknown) {
      debugLogger.error('UserSimulator tick failed', e);
    } finally {
      this.isProcessing = false;
    }
  }

  private async compressMemory() {
    this.isCompressingMemory = true;
    try {
      const contentGenerator = this.config.getContentGenerator();
      if (!contentGenerator) return;

      const memoryToCompress = [...this.sessionMemory];
      const prompt = `Summarize the following chronological session notes into a single, concise list of key facts, preserving specific technical details like file paths, proposed plans, and test results. Drop transient or obsolete observations.
Notes:
${memoryToCompress.map((m, i) => `${i + 1}. ${m}`).join('\n')}`;

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
        'simulator-compression',
        LlmRole.UTILITY_SIMULATOR,
      );

      const summary = response.text?.trim();
      if (summary) {
        debugLogger.log(`[SIMULATOR] Memory compressed. Summary: ${summary}`);
        if (this.interactionsFile) {
          fs.appendFileSync(
            this.interactionsFile,
            `[LOG] [SIMULATOR] Memory compressed. Summary: ${summary}\n\n`,
          );
        }

        // Replace the older items with the new summary string, while preserving any new notes
        // that arrived while the compression was running.
        const newNotes = this.sessionMemory.slice(memoryToCompress.length);
        this.sessionMemory = [summary, ...newNotes];
      }
    } finally {
      this.isCompressingMemory = false;
    }
  }
}
