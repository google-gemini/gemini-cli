

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeSSH } from 'node-ssh';
import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  Icon,
} from './tools.js';
import { Config } from '../config/config.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// #################################################################
// #  State Manager for SSH Connections
// // #################################################################

/**
 * Manages a single, active SSH connection state.
 * This class is used as a singleton within the CLI session.
 */
class SshConnectionManager {
  private static instance: SshConnectionManager;
  private connection: NodeSSH | null = null;
  private connectionDetails: SshConnectParams | null = null;

  private constructor() {}

  public static getInstance(): SshConnectionManager {
    if (!SshConnectionManager.instance) {
      SshConnectionManager.instance = new SshConnectionManager();
    }
    return SshConnectionManager.instance;
  }

  setConnection(ssh: NodeSSH, details: SshConnectParams) {
    if (this.connection) {
      this.connection.dispose();
    }
    this.connection = ssh;
    this.connectionDetails = details;
  }

  getConnection(): { ssh: NodeSSH; details: SshConnectParams } | null {
    if (!this.connection || !this.connectionDetails) {
      return null;
    }
    return { ssh: this.connection, details: this.connectionDetails };
  }

  disconnect() {
    if (this.connection) {
      this.connection.dispose();
      this.connection = null;
      this.connectionDetails = null;
    }
  }
}

// Export a singleton instance for all tools to share
export const sshManager = SshConnectionManager.getInstance();

// #################################################################
// #  Tool 1: ssh_connect
// #################################################################

export interface SshConnectParams {
  host: string;
  username: string;
  authMethod: 'key' | 'password';
  privateKeyPath?: string;
}

export class SshConnectTool extends BaseTool<SshConnectParams, ToolResult> {
  static Name = 'ssh_connect';

  constructor(private readonly config: Config) {
    super(
      SshConnectTool.Name,
      'SSH Connect',
      'Establishes a persistent SSH connection to a remote server. If `authMethod` is "password", the tool will securely and interactively prompt the user for the password. Do not ask for the password yourself.',
      Icon.Terminal, // Changed from Icon.Pod
      {
        type: Type.OBJECT,
        properties: {
          host: { type: Type.STRING, description: 'The hostname or IP address of the server.' },
          username: { type: Type.STRING, description: 'The username for the SSH connection.' },
          authMethod: {
            type: Type.STRING,
            enum: ['key', 'password'],
            description: 'The authentication method to use.',
          },
          privateKeyPath: {
            type: Type.STRING,
            description: 'Path to the private SSH key. Required if authMethod is "key".',
          },
        },
        required: ['host', 'username', 'authMethod'],
      }
    );
  }

  validateToolParams(params: SshConnectParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) return errors;

    if (params.authMethod === 'key' && !params.privateKeyPath) {
      return '`privateKeyPath` is required when `authMethod` is "key".';
    }
    if (params.privateKeyPath) {
        const resolvedPath = path.resolve(os.homedir(), params.privateKeyPath.replace(/^~/, ''));
        if (!fs.existsSync(resolvedPath)) {
            return `Private key file not found at: ${resolvedPath}`;
        }
    }
    return null;
  }

  async shouldConfirmExecute(
    params: SshConnectParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    return {
      type: 'exec', // Changed from 'connect'
      title: 'Confirm SSH Connection',
      command: `ssh ${params.username}@${params.host}`,
      rootCommand: 'ssh',
      onConfirm: async () => {},
    };
  }

  async execute(params: SshConnectParams): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return { llmContent: `Connection failed: ${validationError}`, returnDisplay: `Error: ${validationError}` };
    }

    if (sshManager.getConnection()) {
        return { llmContent: 'An SSH connection is already active. Please disconnect first using `ssh_disconnect`.', returnDisplay: 'Error: An SSH connection is already active.' };
    }

    const ssh = new NodeSSH();
    const connectionConfig = {
      host: params.host,
      username: params.username,
      tryKeyboard: true, 
    };

    try {
      if (params.authMethod === 'key') {
        const privateKey = fs.readFileSync(path.resolve(os.homedir(), params.privateKeyPath!.replace(/^~/, '')), 'utf8');
        await ssh.connect({ ...connectionConfig, privateKey });
      } else { // password auth
        if (!this.config.passwordRequester) {
            return { llmContent: 'Error: Interactive password input is not configured for this environment.', returnDisplay: 'Error: Password input not configured.' };
        }
        try {
            const password = await this.config.passwordRequester.request(`Enter password for ${params.username}@${params.host}:`);
            if (password === null) {
                return { llmContent: 'Connection cancelled by user.', returnDisplay: 'Connection cancelled.' };
            }
            await ssh.connect({ ...connectionConfig, password });
        } catch (e) {
            return { llmContent: `Password prompt failed: ${(e as Error).message}`, returnDisplay: `Error: ${(e as Error).message}` };
        }
      }

      sshManager.setConnection(ssh, params);
      const successMessage = `Successfully connected to ${params.username}@${params.host}.`;
      return { llmContent: successMessage, returnDisplay: successMessage };
    } catch (e) {
      const error = e as Error;
      return { llmContent: `SSH connection failed: ${error.message}`, returnDisplay: `Error: ${error.message}` };
    }
  }
}

// #################################################################
// #  Tool 2: ssh_execute
// #################################################################

export interface SshExecuteParams {
  command: string;
}

export class SshExecuteTool extends BaseTool<SshExecuteParams, ToolResult> {
  static Name = 'ssh_execute';

  constructor(private readonly config: Config) {
    super(
      SshExecuteTool.Name,
      'SSH Execute',
      'Executes a command on the currently active SSH connection.',
      Icon.Terminal,
      {
        type: Type.OBJECT,
        properties: {
          command: { type: Type.STRING, description: 'The shell command to execute remotely.' },
        },
        required: ['command'],
      }
    );
  }

  validateToolParams(params: SshExecuteParams): string | null {
    if (!params.command || params.command.trim() === '') {
        return 'Command cannot be empty.';
    }
    return null;
  }

  async shouldConfirmExecute(
    params: SshExecuteParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    const connection = sshManager.getConnection();
    if (!connection) return false; // Let execute handle the error

    return {
      type: 'exec',
      title: 'Confirm Remote Shell Command',
      command: params.command,
      rootCommand: params.command.split(' ')[0],
      onConfirm: async () => {},
    };
  }

  async execute(params: SshExecuteParams): Promise<ToolResult> {
    const connection = sshManager.getConnection();
    if (!connection) {
      const errorMsg = 'Error: No active SSH connection. Use `ssh_connect` first.';
      return { llmContent: errorMsg, returnDisplay: errorMsg };
    }

    try {
      const cwd = (await connection.ssh.execCommand('pwd')).stdout.trim();
      const result = await connection.ssh.execCommand(params.command, { cwd });
      const output = [
        `Command: ${params.command}`,
        `Stdout: ${result.stdout || '(empty)'}`,
        `Stderr: ${result.stderr || '(empty)'}`,
        `Exit Code: ${result.code}`,
      ].join('\n');
      return { llmContent: output, returnDisplay: result.stdout || result.stderr || `(Command exited with code ${result.code})` };
    } catch (e) {
      const error = e as Error;
      return { llmContent: `Command execution failed: ${error.message}`, returnDisplay: `Error: ${error.message}` };
    }
  }
}

// #################################################################
// #  Tool 3: ssh_disconnect
// #################################################################

export class SshDisconnectTool extends BaseTool<{}, ToolResult> {
  static Name = 'ssh_disconnect';

  constructor(private readonly config: Config) {
    super(
      SshDisconnectTool.Name,
      'SSH Disconnect',
      'Closes the currently active SSH connection.',
      Icon.Terminal, // Changed from Icon.Pod
      {
        type: Type.OBJECT,
        properties: {},
        required: [],
      }
    );
  }

  async execute(): Promise<ToolResult> {
    const connection = sshManager.getConnection();
    if (!connection) {
      const errorMsg = 'No active SSH connection to disconnect.';
      return { llmContent: errorMsg, returnDisplay: errorMsg };
    }

    const host = connection.details.host;
    sshManager.disconnect();
    const successMsg = `Successfully disconnected from ${host}.`;
    return { llmContent: successMsg, returnDisplay: successMsg };
  }
}
