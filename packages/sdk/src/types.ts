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
 * System instructions for a Gemini CLI agent.
 *
 * Can be either a static string or a function that receives the current
 * session context and returns a string (or a promise of one), allowing
 * dynamic instructions that change based on conversation state.
 *
 * @issue-16272/packages/core/coverage/lcov-report/src/utils/security.ts.html WARNING: If using a dynamic function, ensure that any data from the
 * session context is sanitized (e.g., removing newlines, ']', and escaping '<', '>')
 * before being included in the returned instructions to prevent prompt injection.
 */
export type SystemInstructions =
  | string
  | ((context: SessionContext) => string | Promise<string>);

/**
 * Configuration options for creating a {@link GeminiCliAgent}.
 */
export interface GeminiCliAgentOptions {
  /**
   * System instructions that define the agent's behavior.
   * Can be a static string or a dynamic function that receives session context.
   *
   * @issue-16272/packages/core/coverage/lcov-report/src/utils/security.ts.html WARNING: If using a dynamic function, sanitize all input from the
   * SessionContext (e.g., removing newlines, ']', and escaping '<', '>') to prevent prompt injection.
   */
  instructions: SystemInstructions;

  /**
   * Custom tools to register with the agent.
   * Each tool is defined using a Zod schema for input validation.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: Array<Tool<any>>;

  /**
   * Skill directories to load into the agent's skill set.
   */
  skills?: SkillReference[];

  /**
   * The Gemini model to use for this agent.
   * Defaults to the auto-selected model if not specified.
   */
  model?: string;

  /**
   * The working directory for the agent.
   * Defaults to `process.cwd()` if not specified.
   */
  cwd?: string;

  /**
   * Whether to enable debug mode for verbose logging.
   * Defaults to `false`.
   */
  debug?: boolean;

  /**
   * File path to record agent responses to for debugging/replay.
   */
  recordResponses?: string;

  /**
   * File path to load fake/resimulated responses from for testing.
   */
  fakeResponses?: string;
}

/**
 * A virtual filesystem interface available to agents during tool execution.
 *
 * Provides sandboxed read/write access to files, subject to the agent's
 * configured path access policies.
 *
 * Note: Implementations must internally validate and sanitize file paths to
 * prevent path traversal attacks (e.g., checking for '..' or null bytes)
 * using robust functions like resolveToRealPath.
 */
export interface AgentFilesystem {
  /**
   * Read the contents of a file.
   *
   * @param path - Absolute or relative path to the file.
   * @returns The file contents as a UTF-8 string, or `null` if the file
   *   does not exist or access is denied.
   */
  readFile(path: string): Promise<string | null>;

  /**
   * Write content to a file.
   *
   * @param path - Absolute or relative path to the file.
   * @param content - The content to write.
   * @throws {Error} If write access is denied by the agent's policy.
   */
  writeFile(path: string, content: string): Promise<void>;
}

/**
 * Options for configuring shell command execution via {@link AgentShell.exec}.
 */
export interface AgentShellOptions {
  /**
   * Environment variables to set for the command execution.
   * These are merged with the default environment.
   */
  env?: Record<string, string>;

  /**
   * Maximum time in seconds to wait for the command to complete.
   */
  timeoutSeconds?: number;

  /**
   * Working directory in which to execute the command.
   * Defaults to the agent's configured working directory.
   */
  cwd?: string;
}

/**
 * The result of a shell command execution.
 */
export interface AgentShellResult {
  /**
   * The exit code of the process, or `null` if the process was killed
   * or did not exit normally.
   */
  exitCode: number | null;

  /**
   * The combined stdout and stderr output of the command.
   */
  output: string;

  /**
   * The standard output stream content.
   */
  stdout: string;

  /**
   * The standard error stream content.
   */
  stderr: string;

  /**
   * An error object if the command failed to execute or was rejected
   * by policy.
   */
  error?: Error;
}

/**
 * A shell interface for executing commands within an agent's sandboxed environment.
 *
 * Commands are subject to the agent's security policies and may be rejected
 * if they require interactive confirmation.
 */
export interface AgentShell {
  /**
   * Execute a shell command.
   *
   * @issue-16272/packages/core/coverage/lcov-report/src/utils/security.ts.html WARNING: Ensure the command string is properly sanitized and does
   * not contain unvalidated user or LLM input to prevent command injection.
   *
   * @param cmd - The command string to execute.
   * @param options - Optional execution configuration.
   * @returns A promise resolving to the command result.
   */
  exec(cmd: string, options?: AgentShellOptions): Promise<AgentShellResult>;
}

/**
 * Contextual information about the current session, passed to tools and
 * dynamic system instruction functions.
 *
 * Provides access to session metadata, conversation history, filesystem,
 * shell, and the parent agent/session instances.
 */
export interface SessionContext {
  /**
   * Unique identifier for the current session.
   */
  sessionId: string;

  /**
   * Read-only transcript of the conversation so far, including user
   * messages and model responses.
   */
  transcript: readonly Content[];

  /**
   * The current working directory of the session.
   */
  cwd: string;

  /**
   * ISO 8601 timestamp of when this context was created.
   */
  timestamp: string;

  /**
   * Virtual filesystem for reading and writing files within the agent's
   * sandbox.
   *
   * @issue-16272/packages/core/coverage/lcov-report/src/utils/security.ts.html WARNING: This provides full access to the agent's filesystem.
   * Ensure tools using this are trusted and validate their inputs.
   */
  fs: AgentFilesystem;

  /**
   * Shell interface for executing commands within the agent's sandbox.
   *
   * @issue-16272/packages/core/coverage/lcov-report/src/utils/security.ts.html WARNING: This provides full access to the agent's shell.
   * Any tool receiving this context can execute arbitrary commands.
   */
  shell: AgentShell;

  /**
   * The parent agent that owns this session.
   */
  agent: GeminiCliAgent;

  /**
   * The current session instance.
   */
  session: GeminiCliSession;
}
