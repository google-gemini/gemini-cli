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
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

interface Args {
  name: string;
  session?: boolean;
}

async function resolveAndValidateServer(args: Args): Promise<boolean> {
  const name = normalizeServerId(args.name);
  const { mcpServers, blockedServerNames } = await getMcpServersFromConfig();
  if (blockedServerNames.map(normalizeServerId).includes(name)) {
    debugLogger.log(
      `${RED}Error:${RESET} MCP server '${args.name}' is blocked by administrator.`,
    );
    return false;
  }

  // Check all known servers (active + blocked) for existence
  const allKnownServers = [...Object.keys(mcpServers), ...blockedServerNames];
  if (!allKnownServers.map(normalizeServerId).includes(name)) {
    debugLogger.log(
      `${RED}Error:${RESET} Server '${args.name}' not found. Use 'gemini mcp' to see available servers.`,
    );
    return false;
  }

  return true;
}

async function handleEnable(args: Args): Promise<void> {
  const manager = McpServerEnablementManager.getInstance();
  const name = normalizeServerId(args.name);
  const settings = loadSettings();

  const isValid = await resolveAndValidateServer(args);
  if (!isValid) return;

  const result = await canLoadServer(name, {
    adminMcpEnabled: settings.merged.admin?.mcp?.enabled ?? true,
    allowedList: settings.merged.mcp?.allowed,
    excludedList: settings.merged.mcp?.excluded,
  });

  if (!result.allowed) {
    if (result.blockType === 'admin') {
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
}

async function handleDisable(args: Args): Promise<void> {
  const manager = McpServerEnablementManager.getInstance();
  const name = normalizeServerId(args.name);

  const isValid = await resolveAndValidateServer(args);
  if (!isValid) return;

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
