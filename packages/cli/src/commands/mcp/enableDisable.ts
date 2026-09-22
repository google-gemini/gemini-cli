/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import {
  debugLogger,
  getAdminBlockedMcpServersMessage,
} from '@google/gemini-cli-core';
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

/**
 * Resolve a server name against what is actually configured.
 *
 * `getMcpServersFromConfig()` returns `{ mcpServers, blockedServerNames }`.
 * Calling `Object.keys()` on that wrapper yields those two field names, so no
 * real server name ever matched and both commands reported "not found" for
 * every server. `Object.keys()` accepts any object, so the compiler had
 * nothing to complain about when the return shape changed.
 *
 * Servers the admin allowlist removed are gone from `mcpServers`, so they are
 * matched separately. They exist; they just cannot be used. Telling the user
 * "not found" sends them hunting for a typo instead of at their admin policy.
 */
async function resolveServerName(
  rawName: string,
): Promise<{ name: string } | { error: string }> {
  const name = normalizeServerId(rawName);
  const { mcpServers, blockedServerNames } = await getMcpServersFromConfig();

  if (Object.keys(mcpServers).map(normalizeServerId).includes(name)) {
    return { name };
  }

  if (blockedServerNames.map(normalizeServerId).includes(name)) {
    return { error: getAdminBlockedMcpServersMessage([rawName], undefined) };
  }

  return {
    error: `Server '${rawName}' not found. Use 'gemini mcp' to see available servers.`,
  };
}

async function handleEnable(args: Args): Promise<void> {
  const manager = McpServerEnablementManager.getInstance();

  // Check settings blocks
  const settings = loadSettings();

  const resolved = await resolveServerName(args.name);
  if ('error' in resolved) {
    debugLogger.log(`${RED}Error:${RESET} ${resolved.error}`);
    return;
  }
  const { name } = resolved;

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

  const resolved = await resolveServerName(args.name);
  if ('error' in resolved) {
    debugLogger.log(`${RED}Error:${RESET} ${resolved.error}`);
    return;
  }
  const { name } = resolved;

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
