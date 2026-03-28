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
 * Defines the system-level instructions for a Gemini CLI agent session.
 *
 * Can be a static string or a dynamic function that receives the current
 * {@link SessionContext} and returns instructions at runtime, allowing
 * instructions to adapt based on session state such as the working
 * directory or conversation history.
 *
 * @example
 * // Static instructions
 * const instructions: SystemInstructions = "You are a helpful coding assistant.";
 *
 * // Dynamic instructions based on session context
 * const instructions: SystemInstructions = (ctx) =>
 *   `You are working in ${ctx.cwd}. Today is ${ctx.timestamp}.`;
 */
export type SystemInstructions =
  | string
  | ((context: SessionContext) => string | Promise<string>);

/**
 * Configuration options for creating a {@link GeminiCliAgent} instance.
 *
 * Only {@link GeminiCliAgentOptions.instructions | instructions} is required.
 * All other fields are optional and fall back to sensible defaults when omitted.
 *
 * @example
 * const options: GeminiCliAgentOptions = {
 *   instructions: "You are a helpful coding assistant.",
 *   model: "gemini-2.0-flash",
 *   cwd: "/my/project",
 *   debug: true,
 * };
 */
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
}

/**
 * Abstraction over filesystem operations used by the agent.
 *
 * Implement this interface to provide custom file read/write behaviour,
 * for example to add access controls, operate on a virtual filesystem,
 * or intercept file operations in tests.
 *
 * @see {@link AgentShell} for the equivalent shell abstraction.
 */
export interface AgentFilesystem {
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
}

/**
 * Options for controlling shell command execution via {@link AgentShell}.
 */
export interface AgentShellOptions {
  /** Additional environment variables to set for the command. */
  env?: Record<string, string>;
  /** Maximum time in seconds to wait before cancelling the command. */
  timeoutSeconds?: number;
  /** Working directory in which to execute the command. */
  cwd?: string;
}

/**
 * The result returned after executing a shell command via {@link AgentShell.exec}.
 */
export interface AgentShellResult {
  /** The exit code of the process, or null if it was killed by a signal. */
  exitCode: number | null;
  /** Combined stdout and stderr output. */
  output: string;
  /** Standard output stream content. */
  stdout: string;
  /** Standard error stream content. */
  stderr: string;
  /** Set if the command failed to execute at the OS level. */
  error?: Error;
}

/**
 * Abstraction over shell command execution used by the agent.
 *
 * Implement this interface to provide custom command execution behaviour,
 * for example to sandbox commands, mock outputs in tests, or capture
 * and forward shell output to an external system.
 *
 * @see {@link AgentFilesystem} for the equivalent filesystem abstraction.
 *
 * @example
 * const shell: AgentShell = {
 *   exec: async (cmd, options) => {
 *     const result = await runInSandbox(cmd, options);
 *     return result;
 *   }
 * };
 */
export interface AgentShell {
  exec(cmd: string, options?: AgentShellOptions): Promise<AgentShellResult>;
}

/**
 * Runtime context passed to dynamic {@link SystemInstructions} functions
 * and to SDK tool implementations during a session.
 *
 * Provides access to the current session state, filesystem, shell, and
 * references to the parent agent and session objects.
 *
 * @see {@link SystemInstructions} for how context is used in instruction functions.
 * @see {@link GeminiCliSession} for the session lifecycle.
 */
export interface SessionContext {
  /** Unique identifier for this session. */
  sessionId: string;
  /** Full conversation history as an array of Gemini content objects. */
  transcript: Content[];
  /** Absolute path to the current working directory. */
  cwd: string;
  /** ISO 8601 timestamp of when this context snapshot was created. */
  timestamp: string;
  /** Filesystem abstraction for reading and writing files. */
  fs: AgentFilesystem;
  /** Shell abstraction for executing commands. */
  shell: AgentShell;
  /** Reference to the parent {@link GeminiCliAgent} instance. */
  agent: GeminiCliAgent;
  /** Reference to the current {@link GeminiCliSession} instance. */
  session: GeminiCliSession;
}
