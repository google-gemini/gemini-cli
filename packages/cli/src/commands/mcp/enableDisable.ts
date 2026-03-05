/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { debugLogger } from '@google/gemini-cli-core';
import {
  McpServerEnablementManager,
  canLoadServer,
  normalizeServerId,
} from '../../config/mcp/mcpServerEnablement.js';
import { loadSettings } from '../../config/settings.js';
import { exitCli } from '../utils.js';
import { getMcpServersFromConfig } from './list.js';

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

interface Args {
  name: string;
  session?: boolean;
}

async function handleEnable(args: Args): Promise<void> {
  const manager = McpServerEnablementManager.getInstance();
  const name = normalizeServerId(args.name);

  // Check settings blocks
  const settings = loadSettings();

  // Get all servers including extensions
  const servers = await getMcpServersFromConfig();
  const normalizedServerNames = Object.keys(servers).map(normalizeServerId);
  if (!normalizedServerNames.includes(name)) {
    debugLogger.log(
      `${RED}Error:${RESET} Server '${args.name}' not found. Use 'gemini mcp' to see available servers.`,
    );
    return;
  }

  const result = await canLoadServer(name, {
    adminMcpEnabled: settings.merged.admin?.mcp?.enabled ?? true,
    allowedList: settings.merged.mcp?.allowed,
    excludedList: settings.merged.mcp?.excluded,
  });

  if (
    !result.allowed &&
    (result.blockType === 'allowlist' || result.blockType === 'excludelist')
  ) {
    debugLogger.log(`${RED}Error:${RESET} ${result.reason}`);
    return;
  }

  if (args.session) {
    manager.clearSessionDisable(name);
    debugLogger.log(`${GREEN}✓${RESET} Session disable cleared for '${name}'.`);
  } else {
    await manager.enable(name);
    debugLogger.log(`${GREEN}✓${RESET} MCP server '${name}' enabled.`);
  }

  if (result.blockType === 'admin') {
    debugLogger.log(
      `${YELLOW}Warning:${RESET} MCP servers are disabled by administrator.`,
    );
  }
}

async function handleDisable(args: Args): Promise<void> {
  const manager = McpServerEnablementManager.getInstance();
  const name = normalizeServerId(args.name);

  // Get all servers including extensions
  const servers = await getMcpServersFromConfig();
  const normalizedServerNames = Object.keys(servers).map(normalizeServerId);
  if (!normalizedServerNames.includes(name)) {
    debugLogger.log(
      `${RED}Error:${RESET} Server '${args.name}' not found. Use 'gemini mcp' to see available servers.`,
    );
    return;
  }

  if (args.session) {
    manager.disableForSession(name);
    debugLogger.log(
      `${GREEN}✓${RESET} MCP server '${name}' disabled for this session.`,
    );
  } else {
    await manager.disable(name);
    debugLogger.log(`${GREEN}✓${RESET} MCP server '${name}' disabled.`);
  }
}

export const enableCommand: CommandModule<object, Args> = {
  command: 'enable <name>',
  describe: 'Enable an MCP server',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'MCP server name to enable',
        type: 'string',
        demandOption: true,
      })
      .option('session', {
        describe: 'Clear session-only disable',
        type: 'boolean',
        default: false,
      }),
  handler: async (argv) => {
    await handleEnable(argv as Args);
    await exitCli();
  },
};

export const disableCommand: CommandModule<object, Args> = {
  command: 'disable <name>',
  describe: 'Disable an MCP server',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'MCP server name to disable',
        type: 'string',
        demandOption: true,
      })
      .option('session', {
        describe: 'Disable for current session only',
        type: 'boolean',
        default: false,
      }),
  handler: async (argv) => {
    await handleDisable(argv as Args);
    await exitCli();
  },
};
