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

export interface ClaudeCodeProviderOptions {
  binaryPath?: string;
  defaultModel?: string;
}

export class ClaudeCodeProvider implements ModelProvider {
  public readonly name = 'claude';
  private binaryPath: string;
  private defaultModel: string;

  constructor(options: ClaudeCodeProviderOptions = {}) {
    this.defaultModel = options.defaultModel || 'claude-3-7-sonnet';
    this.binaryPath = options.binaryPath || this.resolveBinaryPath();
  }

  private resolveBinaryPath(): string {
    const localPath = path.join(os.homedir(), '.local/bin/claude');
    if (fs.existsSync(localPath)) return localPath;

    const npmGlobalPath = path.join(os.homedir(), '.npm-global/bin/claude');
    if (fs.existsSync(npmGlobalPath)) return npmGlobalPath;

    return 'claude';
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
    const isAvail = await this.isAvailable();
    if (!isAvail) {
      const msg = [
        "Claude Code CLI ('claude') is not installed or not in PATH.",
        "To use Claude Code, install it via:",
        "  npm install -g @anthropic-ai/claude-code",
        "",
        "Tip: You can already access Claude models right now without installing Claude Code via Antigravity:",
        "  /model agy:claude-sonnet-4-6",
      ].join('\n');
      yield { type: 'chunk', text: msg };
      yield { type: 'complete', fullText: msg };
      return;
    }

    const model = request.model || this.defaultModel;
    const prompt = this.formatMessages(request.messages);

    const args = ['-p', '-'];
    if (model) {
      args.push('--model', model);
    }

    const child = spawn(this.binaryPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    child.stdin.on('error', () => {});
    child.stdin.write(prompt);
    child.stdin.end();

    let fullText = '';
    let hasYielded = false;
    let errorOutput = '';

    child.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString();
    });

    const rl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const chunk = line + '\n';
      fullText += chunk;
      hasYielded = true;
      yield { type: 'chunk', text: chunk };
    }

    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('close', resolve);
    });

    if (exitCode !== 0 && !hasYielded) {
      const err = new Error(errorOutput.trim() || `Claude Code process exited with code ${exitCode}`);
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
