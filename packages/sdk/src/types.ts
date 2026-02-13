/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/gemini-cli-core';
import type { GeminiCliAgent } from './agent.js';

export interface AgentFilesystem {
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
}

export interface AgentShellOptions {
  env?: Record<string, string>;
  timeoutSeconds?: number;
  cwd?: string;
}

export interface AgentShellResult {
  exitCode: number | null;
  output: string;
  stdout: string;
  stderr: string;
  error?: Error;
}

export interface AgentShell {
  exec(cmd: string, options?: AgentShellOptions): Promise<AgentShellResult>;
}

export interface SessionContext {
  sessionId: string;
  transcript: Content[];
  cwd: string;
  timestamp: string;
  fs: AgentFilesystem;
  shell: AgentShell;
  agent: GeminiCliAgent;
}
