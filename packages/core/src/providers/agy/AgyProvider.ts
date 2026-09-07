/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ModelProvider, ChatRequest, ModelEvent, ChatMessage } from '../ModelProvider.js';

export interface AgyProviderOptions {
  binaryPath?: string;
  defaultModel?: string;
}

export class AgyProvider implements ModelProvider {
  public readonly name = 'agy';
  private binaryPath: string;
  private defaultModel: string;

  constructor(options: AgyProviderOptions = {}) {
    this.defaultModel = options.defaultModel || 'gemini-3.8-flash-high';
    this.binaryPath = options.binaryPath || this.resolveBinaryPath();
  }

  private resolveBinaryPath(): string {
    const homePath = path.join(os.homedir(), '.config/Antigravity/bin/agy');
    if (fs.existsSync(homePath)) {
      return homePath;
    }
    return 'agy';
  }

  public async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const proc = spawn(this.binaryPath, ['--version']);
        proc.on('error', () => resolve(false));
        proc.on('close', (code) => resolve(code === 0));
      } catch {
        resolve(false);
      }
    });
  }

  public async *chat(request: ChatRequest): AsyncIterable<ModelEvent> {
    const model = request.model || this.defaultModel;
    const prompt = this.formatMessages(request.messages);

    const child = spawn(
      this.binaryPath,
      ['--model', model, '--mode', 'plan', '--output-format', 'stream-json', '--print', prompt],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );

    child.stdin.on('error', () => {});
    child.stdin.end();

    const completion = new Promise<number | null>((resolve) => {
      child.on('error', (error) => { errorOutput = error.message; resolve(-1); });
      child.on('close', resolve);
    });

    const rl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });

    let fullText = '';
    let hasYielded = false;
    let errorOutput = '';

    child.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString();
    });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) continue;

      try {
        const parsed = JSON.parse(trimmed);

        if (parsed.event === 'step_update' && parsed.step_update?.text_delta) {
          const delta = parsed.step_update.text_delta;
          fullText += delta;
          hasYielded = true;
          yield { type: 'chunk', text: delta };
        } else if (parsed.event === 'result') {
          const res = parsed.result;
          if (res?.status === 'SUCCESS' && res.response && !hasYielded) {
            fullText = res.response;
            yield { type: 'chunk', text: res.response };
          } else if (res?.status && res.status !== 'SUCCESS') {
            const err = new Error(res.error_message || `Antigravity request ${res.status.toLowerCase()}. Native tool permissions may be unavailable in headless mode.`);
            yield { type: 'error', error: err };
            return;
          }
        }
      } catch {
        // Skip non-JSON lines
      }
    }

    const exitCode = await completion;

    if (exitCode !== 0 || !fullText.trim()) {
      const err = new Error(errorOutput.trim() || (exitCode === 0 ? 'Antigravity returned no response.' : `Antigravity process exited with code ${exitCode}`));
      yield { type: 'error', error: err };
      return;
    }

    yield { type: 'complete', fullText };
  }

  private formatMessages(messages: ChatMessage[]): string {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const parts: string[] = [
      'You are a text-only model backend for Zoe. Do not invoke any native CLI tools, browse, ask permission, or access files yourself. Zoe owns tool execution. When inspection is needed, output exactly one fenced tool call in the tool:name format described below and stop. Zoe will supply the result in the next request. Otherwise answer the developer directly.',
    ];
    if (systemMessages.length > 0) {
      parts.push(`[System Instructions]\n${systemMessages.map((m) => m.content).join('\n\n')}`);
    }

    if (nonSystemMessages.length === 1 && nonSystemMessages[0]?.role === 'user') {
      parts.push(nonSystemMessages[0].content);
    } else {
      for (const msg of nonSystemMessages) {
        const prefix = msg.role === 'user' ? 'Developer' : 'Zoe';
        parts.push(`${prefix}: ${msg.content}`);
      }
    }

    return parts.join('\n\n');
  }
}
