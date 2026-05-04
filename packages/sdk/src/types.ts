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

/**
 * Instructions that guide the agent's behavior and personality.
 * Can be a static string or a dynamic function that receives the current session context.
 */
export type SystemInstructions =
  | string
  | ((context: SessionContext) => string | Promise<string>);

/**
 * Configuration options for creating a GeminiCliAgent.
 */
export interface GeminiCliAgentOptions {
  /** The system instructions defining the agent's behavior. */
  instructions: SystemInstructions;
  /** Optional list of tools the agent can use. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: Array<Tool<any>>;
  /** Optional list of skills the agent possesses. */
  skills?: SkillReference[];
  /** The model name to use (e.g., 'gemini-1.5-pro'). */
  model?: string;
  /** The current working directory for the agent. */
  cwd?: string;
  /** Whether to enable debug logging. */
  debug?: boolean;
  /** Optional path to record agent responses for testing. */
  recordResponses?: string;
  /** Optional path to load fake responses for testing. */
  fakeResponses?: string;
}

/**
 * Interface for basic filesystem operations that the agent can perform.
 */
export interface AgentFilesystem {
  /** Reads the content of a file at the given path. */
  readFile(path: string): Promise<string | null>;
  /** Writes content to a file at the given path. */
  writeFile(path: string, content: string): Promise<void>;
}

/**
 * Options for executing shell commands.
 */
export interface AgentShellOptions {
  /** Environment variables for the shell process. */
  env?: Record<string, string>;
  /** Timeout for the command in seconds. */
  timeoutSeconds?: number;
  /** The working directory where the command should be executed. */
  cwd?: string;
}

/**
 * The result of a shell command execution.
 */
export interface AgentShellResult {
  /** The exit code of the process, or null if it was terminated. */
  exitCode: number | null;
  /** The combined output of stdout and stderr. */
  output: string;
  /** The content written to stdout. */
  stdout: string;
  /** The content written to stderr. */
  stderr: string;
  /** Any error that occurred during execution. */
  error?: Error;
}

/**
 * Interface for executing shell commands within the agent's environment.
 */
export interface AgentShell {
  /** Executes a shell command and returns the result. */
  exec(cmd: string, options?: AgentShellOptions): Promise<AgentShellResult>;
}

/**
 * Contextual information provided to tools and dynamic instructions during a session.
 */
export interface SessionContext {
  /** Unique identifier for the current session. */
  sessionId: string;
  /** The full transcript of the conversation so far. */
  transcript: readonly Content[];
  /** The current working directory of the session. */
  cwd: string;
  /** The ISO timestamp of when the context was generated. */
  timestamp: string;
  /** Access to the filesystem for the agent. */
  fs: AgentFilesystem;
  /** Access to the shell for the agent. */
  shell: AgentShell;
  /** Reference to the current GeminiCliAgent instance. */
  agent: GeminiCliAgent;
  /** Reference to the current GeminiCliSession instance. */
  session: GeminiCliSession;
}
