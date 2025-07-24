/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand, CommandContext, CommandKind } from './types.js';
import * as os from 'os';
import * as path from 'path';

const HELP_MESSAGE = `Invalid subcommand. Available commands:
  /directory add <path>  - Add a directory to the workspace
  /directory show        - Show all workspace directories`;

export function expandHomeDir(p: string): string {
  if (!p) {
    return '';
  }
  let expandedPath = p;
  if (p.toLowerCase().startsWith('%userprofile%')) {
    expandedPath = os.homedir() + p.substring('%userprofile%'.length);
  } else if (p.startsWith('~')) {
    expandedPath = os.homedir() + p.substring(1);
  }
  return path.normalize(expandedPath);
}

const addSubcommand: SlashCommand = {
  name: 'add',
  description: 'Add a directory to the workspace',
  kind: CommandKind.BUILT_IN,
  action: (context: CommandContext, args: string) => {
    const config = context.services.config;
    if (!config) {
      return {
        type: 'message' as const,
        messageType: 'info' as const,
        content: 'No configuration available',
      };
    }

    // Check if running in a restrictive sandbox profile
    if (config.isRestrictiveSandbox()) {
      return {
        type: 'message' as const,
        messageType: 'error' as const,
        content:
          'The /directory add command is not supported in restrictive sandbox profiles. Please use --include-directories when starting the session instead.',
      };
    }

    const directory = expandHomeDir(args.trim());
    if (!directory) {
      return {
        type: 'message' as const,
        messageType: 'info' as const,
        content: 'Please provide a directory path: /directory add <path>',
      };
    }

    try {
      const workspaceContext = config.getWorkspaceContext();
      workspaceContext.addDirectory(directory);
      const gemini = config.getGeminiClient();
      if (gemini) {
        gemini.refreshEnvironment();
      }

      return {
        type: 'update_context' as const,
        message: `Added directory to workspace: ${directory}`,
      };
    } catch (_error) {
      return {
        type: 'message' as const,
        messageType: 'error' as const,
        content: `Failed to add directory: ${_error instanceof Error ? _error.message : String(_error)}`,
      };
    }
  },
};

const showSubcommand: SlashCommand = {
  name: 'show',
  description: 'Show all workspace directories',
  kind: CommandKind.BUILT_IN,
  action: (context: CommandContext) => {
    const config = context.services.config;
    if (!config) {
      return {
        type: 'message' as const,
        messageType: 'info' as const,
        content: 'No configuration available',
      };
    }

    try {
      const workspaceContext = config.getWorkspaceContext();
      const directories = workspaceContext.getDirectories();

      if (directories.length === 0) {
        return {
          type: 'message' as const,
          messageType: 'info' as const,
          content: 'No directories in workspace',
        };
      }

      const message = `Workspace directories:\n${directories.map((dir, index) => `  ${index + 1}. ${dir}`).join('\n')}`;

      return {
        type: 'message' as const,
        messageType: 'info' as const,
        content: message,
      };
    } catch (_error) {
      return {
        type: 'message' as const,
        messageType: 'error' as const,
        content: `Failed to list directories: ${_error instanceof Error ? _error.message : String(_error)}`,
      };
    }
  },
};

export const directoryCommand: SlashCommand = {
  name: 'directory',
  altNames: ['dir'],
  description: 'Manage workspace directories',
  kind: CommandKind.BUILT_IN,
  subCommands: [addSubcommand, showSubcommand],
  action: (context: CommandContext, args: string) => {
    const [subcommandName, ...subcommandArgs] = args.trim().split(/\s+/);
    const subcommand = directoryCommand.subCommands?.find(
      (cmd) => cmd.name === subcommandName,
    );

    if (subcommand?.action) {
      return subcommand.action(context, subcommandArgs.join(' '));
    }

    return {
      type: 'message' as const,
      messageType: 'info' as const,
      content: HELP_MESSAGE,
    };
  },
};
