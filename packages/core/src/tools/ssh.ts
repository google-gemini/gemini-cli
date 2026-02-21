/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from 'ssh2';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { Config } from '../config/config.js';
import { ToolErrorType } from './tool-error.js';
import type {
  ToolInvocation,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolExecuteConfirmationDetails,
} from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { ToolConfirmationOutcome } from './tools.js';
import { SSH_TOOL_NAME } from './tool-names.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { SSH_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';

/** Default SSH connection timeout in milliseconds. */
const DEFAULT_SSH_TIMEOUT_MS = 30_000;

/** Default command execution timeout in milliseconds (5 minutes). */
const DEFAULT_COMMAND_TIMEOUT_MS = 300_000;

/** Maximum output size in bytes before truncation (512 KB). */
const MAX_OUTPUT_BYTES = 512 * 1024;

/**
 * Parameters for the SSH tool.
 */
export interface SSHToolParams {
  /** The hostname or IP address of the remote device. */
  host: string;

  /** The SSH port (defaults to 22). */
  port?: number;

  /** The username for SSH authentication. */
  username: string;

  /** The password for SSH authentication (optional if using key-based auth). */
  password?: string;

  /** Path to the private key file for SSH authentication (optional). */
  private_key_path?: string;

  /** The command to execute on the remote device. */
  command: string;

  /** Optional description of what the command does. */
  description?: string;
}

/**
 * Resolves a private key path, supporting ~ expansion.
 * Validates the path is within allowed directories to prevent arbitrary file reads.
 */
async function resolvePrivateKey(
  keyPath: string,
  config: Config,
): Promise<string> {
  const homeDir = os.homedir();
  let resolved: string;

  if (keyPath.startsWith('~')) {
    resolved = path.join(homeDir, keyPath.slice(1));
  } else if (path.isAbsolute(keyPath)) {
    resolved = keyPath;
  } else {
    resolved = path.resolve(config.getWorkingDir(), keyPath);
  }

  // Security: Ensure the path is within the user's home directory or the project workspace.
  const isInHomeDir = path.resolve(resolved).startsWith(path.resolve(homeDir));
  const isPathAllowed = config.isPathAllowed(resolved);

  if (!isInHomeDir && !isPathAllowed) {
    throw new Error(
      `Path "${keyPath}" resolves outside of the allowed directories. ` +
        'Private key must be within the user home directory or project workspace.',
    );
  }

  return fs.readFile(resolved, 'utf-8');
}

/**
 * Invocation implementation for the SSH tool.
 */
class SSHToolInvocation extends BaseToolInvocation<SSHToolParams, ToolResult> {
  private readonly _config: Config;

  constructor(
    config: Config,
    params: SSHToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
    this._config = config;
  }

  getDescription(): string {
    const port = this.params.port ?? 22;
    let desc = `${this.params.command} [on ${this.params.username}@${this.params.host}:${port}]`;
    if (this.params.description) {
      desc += ` (${this.params.description.replace(/\n/g, ' ')})`;
    }
    return desc;
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const confirmationDetails: ToolExecuteConfirmationDetails = {
      type: 'exec',
      title: 'Confirm SSH Command',
      command: `ssh ${this.params.username}@${this.params.host} "${this.params.command}"`,
      rootCommand: 'ssh',
      rootCommands: ['ssh'],
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        await this.publishPolicyUpdate(outcome);
      },
    };
    return confirmationDetails;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    if (signal.aborted) {
      return {
        llmContent: 'SSH command was cancelled before it could start.',
        returnDisplay: 'SSH command cancelled.',
      };
    }

    const port = this.params.port ?? 22;

    try {
      // Resolve authentication
      let privateKey: string | undefined;
      if (this.params.private_key_path) {
        try {
          privateKey = await resolvePrivateKey(
            this.params.private_key_path,
            this._config,
          );
        } catch (err) {
          return {
            llmContent: `Error reading private key at "${this.params.private_key_path}": ${err instanceof Error ? err.message : String(err)}`,
            returnDisplay: 'Failed to read SSH private key.',
            error: {
              message: `Failed to read private key: ${err instanceof Error ? err.message : String(err)}`,
              type: ToolErrorType.SSH_CONNECTION_ERROR,
            },
          };
        }
      }

      // If no password and no key, try the default SSH key
      if (!this.params.password && !privateKey) {
        const defaultKeyPath = path.join(os.homedir(), '.ssh', 'id_rsa');
        try {
          privateKey = await fs.readFile(defaultKeyPath, 'utf-8');
        } catch {
          // Also try ed25519
          const ed25519Path = path.join(os.homedir(), '.ssh', 'id_ed25519');
          try {
            privateKey = await fs.readFile(ed25519Path, 'utf-8');
          } catch {
            // No default key found; will fail at connect if no password
          }
        }
      }

      const result = await this.executeSSHCommand(
        this.params.host,
        port,
        this.params.username,
        this.params.command,
        signal,
        this.params.password,
        privateKey,
      );

      return result;
    } catch (err) {
      const errorMsg = `SSH execution error: ${err instanceof Error ? err.message : String(err)}`;
      return {
        llmContent: errorMsg,
        returnDisplay: 'SSH command failed.',
        error: {
          message: errorMsg,
          type: ToolErrorType.SSH_EXECUTION_ERROR,
        },
      };
    }
  }

  /**
   * Executes a command over SSH and returns the result.
   */
  private executeSSHCommand(
    host: string,
    port: number,
    username: string,
    command: string,
    signal: AbortSignal,
    password?: string,
    privateKey?: string,
  ): Promise<ToolResult> {
    return new Promise<ToolResult>((resolve) => {
      const conn = new Client();

      let stdout = '';
      let stderr = '';
      let exitCode: number | null = null;
      let timedOut = false;
      let settled = false;

      const commandTimeout = setTimeout(() => {
        timedOut = true;
        conn.end();
      }, DEFAULT_COMMAND_TIMEOUT_MS);

      const onAbort = () => {
        conn.end();
      };

      signal.addEventListener('abort', onAbort, { once: true });

      const cleanup = () => {
        clearTimeout(commandTimeout);
        signal.removeEventListener('abort', onAbort);
      };

      const settle = (result: ToolResult) => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(result);
        }
      };

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            settle({
              llmContent: `Error executing command: ${err.message}`,
              returnDisplay: 'SSH command execution failed.',
              error: {
                message: err.message,
                type: ToolErrorType.SSH_EXECUTION_ERROR,
              },
            });
            return;
          }

          stream.on('data', (data: Buffer) => {
            if (stdout.length < MAX_OUTPUT_BYTES) {
              stdout += data.toString();
            }
          });

          stream.stderr.on('data', (data: Buffer) => {
            if (stderr.length < MAX_OUTPUT_BYTES) {
              stderr += data.toString();
            }
          });

          stream.on('close', (code: number) => {
            exitCode = code;
            conn.end();
          });
        });
      });

      conn.on('close', () => {
        if (signal.aborted) {
          settle({
            llmContent: 'SSH command was cancelled by user.',
            returnDisplay: 'SSH command cancelled.',
          });
          return;
        }

        if (timedOut) {
          let content = `SSH command timed out after ${(DEFAULT_COMMAND_TIMEOUT_MS / 60000).toFixed(1)} minutes.`;
          if (stdout.trim()) {
            content += `\nPartial output:\n${stdout}`;
          }
          settle({
            llmContent: content,
            returnDisplay: 'SSH command timed out.',
            error: {
              message: 'Command timed out',
              type: ToolErrorType.SSH_EXECUTION_ERROR,
            },
          });
          return;
        }

        // Build result
        const parts: string[] = [];
        parts.push(`Output: ${stdout || '(empty)'}`);

        if (stderr.trim()) {
          parts.push(`Stderr: ${stderr}`);
        }

        if (exitCode !== null && exitCode !== 0) {
          parts.push(`Exit Code: ${exitCode}`);
        }

        const llmContent = parts.join('\n');

        let displayMessage = '';
        if (stdout.trim()) {
          displayMessage = stdout;
        } else if (stderr.trim()) {
          displayMessage = `Error: ${stderr}`;
        } else if (exitCode !== null && exitCode !== 0) {
          displayMessage = `Command exited with code: ${exitCode}`;
        }

        settle({
          llmContent,
          returnDisplay: displayMessage,
          ...(exitCode !== null && exitCode !== 0
            ? {
                error: {
                  message: `Command exited with code ${exitCode}`,
                  type: ToolErrorType.SSH_EXECUTION_ERROR,
                },
              }
            : {}),
        });
      });

      conn.on('error', (err: Error) => {
        settle({
          llmContent: `SSH connection error: ${err.message}`,
          returnDisplay: 'SSH connection failed.',
          error: {
            message: err.message,
            type: ToolErrorType.SSH_CONNECTION_ERROR,
          },
        });
      });

      // Build connection config
      const connectConfig: {
        host: string;
        port: number;
        username: string;
        readyTimeout: number;
        privateKey?: string;
        password?: string;
        agent?: string;
      } = {
        host,
        port,
        username,
        readyTimeout: DEFAULT_SSH_TIMEOUT_MS,
      };

      if (privateKey) {
        connectConfig.privateKey = privateKey;
      }

      if (password) {
        connectConfig.password = password;
      }

      // If neither key nor password, allow keyboard-interactive or agent
      if (!privateKey && !password) {
        connectConfig.agent = process.env['SSH_AUTH_SOCK'];
      }

      conn.connect(connectConfig);
    });
  }
}

/**
 * SSH tool for executing commands on remote devices via SSH.
 */
export class SSHTool extends BaseDeclarativeTool<SSHToolParams, ToolResult> {
  static readonly Name = SSH_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      SSHTool.Name,
      'SSH',
      SSH_DEFINITION.base.description!,
      Kind.Execute,
      SSH_DEFINITION.base.parametersJsonSchema,
      messageBus,
      false, // output is not markdown
      false, // output cannot be updated (non-streaming)
    );
  }

  protected override validateToolParamValues(
    params: SSHToolParams,
  ): string | null {
    if (!params.host.trim()) {
      return 'SSH host cannot be empty.';
    }
    if (!params.username.trim()) {
      return 'SSH username cannot be empty.';
    }
    if (!params.command.trim()) {
      return 'SSH command cannot be empty.';
    }
    if (params.port !== undefined && (params.port < 1 || params.port > 65535)) {
      return 'SSH port must be between 1 and 65535.';
    }
    return null;
  }

  protected createInvocation(
    params: SSHToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<SSHToolParams, ToolResult> {
    return new SSHToolInvocation(
      this.config,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(SSH_DEFINITION, modelId);
  }
}
