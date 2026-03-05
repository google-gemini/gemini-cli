/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../config/settings.js';
import { runNonInteractive } from '../nonInteractiveCli.js';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { createVoicePrompt } from './voiceResponseMode.js';

interface VoiceSessionOptions {
  input?: Readable;
  createPromptId?: () => string;
}

export class VoiceSession {
  private readonly input: Readable;
  private readonly createPromptId: () => string;

  constructor(
    private readonly config: Config,
    private readonly settings: LoadedSettings,
    options: VoiceSessionOptions = {},
  ) {
    this.input = options.input ?? process.stdin;
    this.createPromptId = options.createPromptId ?? (() => randomUUID());
  }

  async start(): Promise<void> {
    const rl = readline.createInterface({
      input: this.input,
    });

    try {
      for await (const line of rl) {
        const trimmed = line.trim();
        if (trimmed) {
          const prompt = createVoicePrompt(trimmed);
          this.config
            .getGeminiClient()
            ?.getChat()
            .setSystemInstruction(prompt.system);

          await runNonInteractive({
            config: this.config,
            settings: this.settings,
            input: prompt.user,
            prompt_id: this.createPromptId(),
          });
        }
      }
    } finally {
      rl.close();
    }
  }
}
