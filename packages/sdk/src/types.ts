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
 * System instructions that define the agent's behavior and persona.
 * Can be either a static string or a dynamic function that generates
 * instructions based on the current session context.
 *
 * @example
 * // Static instructions
 * const instructions: SystemInstructions = "You are a helpful coding assistant.";
 *
 * @example
 * // Dynamic instructions based on context
 * const instructions: SystemInstructions = (context) => {
 *   return `You are working in ${context.cwd}. Help the user with their code.`;
 * };
 */
export type SystemInstructions =
  | string
  | ((context: SessionContext) => string | Promise<string>);

/**
 * Configuration options for creating a new Gemini CLI agent.
 * These options control the agent's behavior, available tools, and runtime settings.
 */
export interface GeminiCliAgentOptions {
  /**
   * System instructions that define the agent's behavior and persona.
   * This is required and sets the foundation for how the agent responds.
   */
  instructions: SystemInstructions;
  /**
   * Optional array of custom tools that the agent can use.
   * Tools extend the agent's capabilities beyond its base functionality.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: Array<Tool<any>>;
  /**
   * Optional array of skill references that the agent can invoke.
   * Skills are reusable, composable units of agent functionality.
   */
  skills?: SkillReference[];
  /**
   * Optional model identifier to use for the agent.
   * If not specified, the default model configured in Gemini CLI is used.
   */
  model?: string;
  /**
   * Optional working directory for the agent.
   * Defaults to the current working directory if not specified.
   */
  cwd?: string;
  /**
   * Enable debug mode for verbose logging.
   * Useful for troubleshooting agent behavior during development.
   */
  debug?: boolean;
  /**
   * Optional file path to record API responses to.
   * Useful for creating reproducible test fixtures.
   */
  recordResponses?: string;
  /**
   * Optional file path to load fake/mocked API responses from.
   * Useful for testing without making actual API calls.
   */
  fakeResponses?: string;
}

/**
 * Interface for file system operations available to the agent.
 * Provides a sandboxed abstraction over the underlying file system.
 */
export interface AgentFilesystem {
  /**
   * Reads the content of a file at the specified path.
   * @param path - The file path to read from (can be relative or absolute).
   * @returns The file content as a string, or null if the file doesn't exist.
   */
  readFile(path: string): Promise<string | null>;
  /**
   * Writes content to a file at the specified path.
   * Creates the file if it doesn't exist, or overwrites it if it does.
   * @param path - The file path to write to (can be relative or absolute).
   * @param content - The string content to write to the file.
   */
  writeFile(path: string, content: string): Promise<void>;
}

/**
 * Options for executing shell commands through the agent.
 */
export interface AgentShellOptions {
  /**
   * Optional environment variables to set for the shell command.
   * These are merged with the existing environment.
   */
  env?: Record<string, string>;
  /**
   * Optional timeout in seconds for the command execution.
   * Commands exceeding this timeout will be terminated.
   */
  timeoutSeconds?: number;
  /**
   * Optional working directory for the command.
   * Defaults to the agent's current working directory if not specified.
   */
  cwd?: string;
}

/**
 * Result of executing a shell command through the agent.
 */
export interface AgentShellResult {
  /**
   * The exit code of the command.
   * Typically 0 indicates success, non-zero indicates an error.
   * May be null if the process was terminated abnormally.
   */
  exitCode: number | null;
  /**
   * Combined stdout and stderr output from the command.
   * Useful when you don't need to distinguish between the two streams.
   */
  output: string;
  /**
   * Standard output from the command (currently contains combined stdout/stderr).
   */
  stdout: string;
  /**
   * Standard error output from the command (currently always empty).
   */
  stderr: string;
  /**
   * Error object if the command execution failed.
   * This captures errors like command not found, permissions issues, etc.
   */
  error?: Error;
}

/**
 * Interface for executing shell commands through the agent.
 * Provides a controlled way to run system commands.
 */
export interface AgentShell {
  /**
   * Executes a shell command and returns the result.
   * @param cmd - The shell command to execute.
   * @param options - Optional configuration for the command execution.
   * @returns A promise that resolves with the command result.
   */
  exec(cmd: string, options?: AgentShellOptions): Promise<AgentShellResult>;
}

/**
 * Context information available during a Gemini CLI session.
 * This is passed to dynamic system instructions and provides
 * access to session state, file system, and shell capabilities.
 */
export interface SessionContext {
  /**
   * Unique identifier for the current session.
   */
  sessionId: string;
  /**
   * The conversation transcript containing all messages exchanged in the session.
   */
  transcript: Content[];
  /**
   * The current working directory for the session.
   */
  cwd: string;
  /**
   * ISO 8601 timestamp of when the session started.
   */
  timestamp: string;
  /**
   * File system interface for reading and writing files.
   */
  fs: AgentFilesystem;
  /**
   * Shell interface for executing system commands.
   */
  shell: AgentShell;
  /**
   * Reference to the agent instance managing this session.
   */
  agent: GeminiCliAgent;
  /**
   * Reference to the current session instance.
   */
  session: GeminiCliSession;
}
