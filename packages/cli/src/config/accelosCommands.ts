/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

// Accelos command configuration interfaces
export interface AccelosCommandOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

export interface AccelosCommandConfig {
  name: string;
  description: string;
  command: string;
  arguments: string[];
  options?: AccelosCommandOptions;
}

export interface AccelosCommandsFile {
  commands: AccelosCommandConfig[];
}

/**
 * Load accelos.commands.json from the current working directory
 */
export function loadAccelosCommands(cwd: string = process.cwd()): AccelosCommandConfig[] {
  const commandsFilePath = path.join(cwd, 'accelos.commands.json');
  
  try {
    if (!fs.existsSync(commandsFilePath)) {
      return [];
    }
    
    const fileContent = fs.readFileSync(commandsFilePath, 'utf8');
    const commandsFile: AccelosCommandsFile = JSON.parse(fileContent);
    
    if (!commandsFile.commands || !Array.isArray(commandsFile.commands)) {
      console.warn('[AccelosCommands] Invalid commands file structure');
      return [];
    }
    
    return commandsFile.commands;
  } catch (error) {
    console.warn('[AccelosCommands] Failed to load commands file:', error);
    return [];
  }
}

/**
 * Create yargs option configuration for an accelos command
 */
export function createYargsOptionForCommand(command: AccelosCommandConfig) {
  return {
    type: 'boolean' as const,
    description: command.description,
    default: false,
  };
}

/**
 * Execute an accelos command
 */
export function executeAccelosCommand(command: AccelosCommandConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const options = {
      cwd: command.options?.cwd || process.cwd(),
      env: {
        ...process.env,
        ...command.options?.env,
      },
      stdio: 'inherit' as const,
    };

    console.log(`[AccelosCommand] Executing: ${command.command} ${command.arguments.join(' ')}`);
    
    const child = spawn(command.command, command.arguments, options);
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[AccelosCommand] Command '${command.name}' completed successfully`);
        resolve();
      } else {
        console.error(`[AccelosCommand] Command '${command.name}' failed with exit code ${code}`);
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      console.error(`[AccelosCommand] Error executing '${command.name}':`, error);
      reject(error);
    });
    
    // Handle timeout if specified
    if (command.options?.timeout) {
      setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command '${command.name}' timed out after ${command.options?.timeout}ms`));
      }, command.options.timeout);
    }
  });
}

/**
 * Check if any accelos command was triggered in the CLI args
 */
export function getTriggeredAccelosCommand(
  argv: Record<string, any>, 
  commands: AccelosCommandConfig[]
): AccelosCommandConfig | null {
  for (const command of commands) {
    if (argv[command.name] === true) {
      return command;
    }
  }
  return null;
}