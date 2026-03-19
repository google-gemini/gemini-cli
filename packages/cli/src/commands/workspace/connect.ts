/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, ArgumentsCamelCase } from 'yargs';
import { 
  WorkspaceHubClient, 
  SSHService, 
  SyncService, 
  type Config, 
  type WorkspaceHubInfo 
} from '@google-gemini-cli-core';

import { exitCli } from '../utils.js';
import chalk from 'chalk';
import { execSync } from 'node:child_process';

interface ConnectArgs {
  config?: Config;
  id: string;
  forwardAgent?: boolean;
  wait?: boolean;
  sync?: boolean;
  githubPat?: string;
}

async function waitForReady(client: WorkspaceHubClient, id: string): Promise<WorkspaceHubInfo> {
  let attempts = 0;
  const maxAttempts = 30; // 5 minutes with 10s interval

  while (attempts < maxAttempts) {
    const ws = await client.getWorkspace(id);
    if (!ws) throw new Error(`Workspace ${id} disappeared.`);
    if (ws.status === 'READY') return ws;
    if (ws.status === 'ERROR') throw new Error(`Workspace ${id} entered ERROR state.`);

    // eslint-disable-next-line no-console
    console.log(chalk.blue(`  Status: ${ws.status}. Waiting for READY... (${attempts + 1}/${maxAttempts})`));
    await new Promise(resolve => setTimeout(resolve, 10000));
    attempts++;
  }

  throw new Error(`Timeout waiting for workspace ${id} to become READY.`);
}

function getGitHubToken(): string | null {
    try {
        return execSync('gh auth token', { encoding: 'utf8' }).trim();
    } catch (e) {
        return null;
    }
}

export async function connectToWorkspace(args: ArgumentsCamelCase<ConnectArgs>): Promise<void> {
  if (!args.config) {
    // eslint-disable-next-line no-console
    console.error(chalk.red('Internal error: Config not loaded.'));
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const hubUrl = process.env['GEMINI_WORKSPACE_HUB_URL'] || 'http://localhost:8080';
  const client = new WorkspaceHubClient(hubUrl);

  try {
    // eslint-disable-next-line no-console
    console.log(chalk.yellow(`Fetching workspace details for "${args.id}"...`));
    
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const workspaces: WorkspaceHubInfo[] = await client.listWorkspaces();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const ws: WorkspaceHubInfo | undefined = workspaces.find(w => w.id === args.id || w.name === args.id);

    if (!ws) {
      // eslint-disable-next-line no-console
      console.error(chalk.red(`Error: Workspace "${args.id}" not found.`));
      return;
    }

    let readyWs = ws;
    if (ws.status !== 'READY') {
        if (args.wait) {
            readyWs = await waitForReady(client, args.id);
        } else {
            // eslint-disable-next-line no-console
            console.warn(chalk.yellow(`Warning: Workspace is in status ${ws.status}.`));
            if (ws.status === 'PROVISIONING') {
                // eslint-disable-next-line no-console
                console.log(chalk.blue('Use --wait to automatically wait for provisioning to complete.'));
            }
        }
    }

    const { instance_name: instanceName, zone, project_id: projectId } = readyWs;
    const ssh = new SSHService();

    // 1. Sync settings if enabled
    if (args.sync !== false) {
      // eslint-disable-next-line no-console
      console.log(chalk.yellow(`Syncing local settings (~/.gemini) to remote...`));
      const sync = new SyncService();
      try {
        await sync.pushSettings({
            instanceName,
            zone,
            project: projectId,
        });
        // eslint-disable-next-line no-console
        console.log(chalk.green(`✓ Settings synced.`));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(chalk.red(`Warning: Settings sync failed, continuing connection...`), (err as Error).message);
      }
    }

    // 2. Inject GitHub PAT if available
    const pat = args.githubPat || getGitHubToken();
    if (pat) {
        // eslint-disable-next-line no-console
        console.log(chalk.yellow('Injecting GitHub credentials...'));
        try {
            await ssh.pushSecret({ instanceName, zone, project: projectId }, '.gh_token', pat);
            // eslint-disable-next-line no-console
            console.log(chalk.green('✓ Credentials injected.'));
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(chalk.red('Warning: Failed to inject GitHub credentials.'), (err as Error).message);
        }
    }

    // 3. Notify Hub of connection (refresh TTL)
    try {
        await client.notifyConnect(readyWs.id);
    } catch (err) {
        debugLogger.warn(`[Connect] Failed to notify Hub of connection:`, err);
    }

    // 4. Connect via SSH
    // eslint-disable-next-line no-console
    console.log(chalk.green(`🚀 Teleporting to ${instanceName} (${zone})...`));
    
    // Command to run on the remote VM: attach to the shpool session
    const remoteCommand = 'shpool attach main || shpool attach';

    await ssh.connect({
      instanceName,
      zone,
      project: projectId,
      command: remoteCommand,
      forwardAgent: args.forwardAgent,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(chalk.red('Connection failed:'), message);
  }
}

export const connectCommand: CommandModule<object, ConnectArgs> = {
  command: 'connect <id>',
  describe: 'Connect to a remote workspace',
  builder: (yargs) => yargs
    .positional('id', {
      type: 'string',
      describe: 'ID or Name of the workspace to connect to',
      demandOption: true,
    })
    .option('forward-agent', {
      alias: 'A',
      type: 'boolean',
      describe: 'Forward SSH agent to the remote workspace',
      default: false,
    })
    .option('wait', {
      alias: 'w',
      type: 'boolean',
      describe: 'Wait for the workspace to become READY if it is provisioning',
      default: false,
    })
    .option('sync', {
      type: 'boolean',
      describe: 'Synchronize local ~/.gemini settings to the remote workspace',
      default: true,
    })
    .option('github-pat', {
        type: 'string',
        describe: 'GitHub Personal Access Token to inject',
    }),
  handler: async (argv) => {
    await connectToWorkspace(argv);
    await exitCli();
  },
};
