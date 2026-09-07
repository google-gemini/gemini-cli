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

export interface CodexProviderOptions {
  binaryPath?: string;
  defaultModel?: string;
}

export class CodexProvider implements ModelProvider {
  public readonly name = 'codex';
  private binaryPath: string;
  private defaultModel: string;

  constructor(options: CodexProviderOptions = {}) {
    this.defaultModel = options.defaultModel || 'gpt-6-astra';
    this.binaryPath = options.binaryPath || this.resolveBinaryPath();
  }

  private resolveBinaryPath(): string {
    const homePath = path.join(os.homedir(), '.local/bin/codex');
    if (fs.existsSync(homePath)) {
      return homePath;
    }
    return 'codex';
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

    const args = ['exec', '--json', '--ephemeral', '-s', 'read-only'];
    if (model) {
      args.push('-m', model);
    }
    args.push('-');

    const child = spawn(this.binaryPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    child.stdin.on('error', () => {});
    child.stdin.write(prompt);
    child.stdin.end();

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

        if (parsed.type === 'item.completed' && parsed.item?.type === 'agent_message' && parsed.item.text) {
          const text = parsed.item.text;
          fullText += text;
          hasYielded = true;
          yield { type: 'chunk', text };
        } else if (parsed.type === 'error') {
          const err = new Error(parsed.message || 'Codex execution error');
          yield { type: 'error', error: err };
          return;
        }
      } catch {
        // Skip non-JSON lines
      }
    }

    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('close', resolve);
    });

    if (exitCode !== 0 && !hasYielded) {
      const err = new Error(errorOutput.trim() || `Codex process exited with code ${exitCode}`);
      yield { type: 'error', error: err };
      return;
    }

    yield { type: 'complete', fullText };
  }

  private formatMessages(messages: ChatMessage[]): string {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const parts: string[] = [];
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
