/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/gemini-cli-core';
import type { Tool } from './tool.js';
import type { SkillReference } from './skills.js';
import type { GeminiCliAgent } from './agent.js';
import type { GeminiCliSession } from './session.js';
import type { Logger } from './logger.js';

export type SystemInstructions =
  | string
  | ((context: SessionContext) => string | Promise<string>);

export interface GeminiCliAgentOptions {
  instructions: SystemInstructions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: Array<Tool<any>>;
  skills?: SkillReference[];
  model?: string;
  cwd?: string;
  debug?: boolean;
  recordResponses?: string;
  fakeResponses?: string;
  /**
   * Optional logger instance for structured logging.
   * If not provided, a ConsoleLogger with INFO level is used by default.
   * Pass a NoopLogger to suppress all logging output (useful for testing).
   */
  logger?: Logger;
}

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
  session: GeminiCliSession;
}
