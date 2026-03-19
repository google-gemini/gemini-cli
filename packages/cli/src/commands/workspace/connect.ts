/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, ArgumentsCamelCase } from 'yargs';
import { WorkspaceHubClient, SSHService, type Config, type WorkspaceHubInfo } from '@google-gemini-cli-core';
import { exitCli } from '../utils.js';
import chalk from 'chalk';

interface ConnectArgs {
  config?: Config;
  id: string;
}

export async function connectToWorkspace(args: ArgumentsCamelCase<ConnectArgs>): Promise<void> {
  if (!args.config) {
    // eslint-disable-next-line no-console
    console.error(chalk.red('Internal error: Config not loaded.'));
    return;
  }

  const hubUrl = 'http://localhost:8080';
  const client = new WorkspaceHubClient(hubUrl);

  try {
    // eslint-disable-next-line no-console
    console.log(chalk.yellow(`Fetching workspace details for "${args.id}"...`));
    
    // We need to fetch the workspace info to get the instance name and zone
    const workspaces = await client.listWorkspaces() as WorkspaceHubInfo[];
    const ws = workspaces.find(w => w.id === args.id || w.name === args.id);

    if (!ws) {
      // eslint-disable-next-line no-console
      console.error(chalk.red(`Error: Workspace "${args.id}" not found.`));
      return;
    }

    const { status, instance_name: instanceName, zone } = ws;

    if (status !== 'READY' && status !== 'PROVISIONING') {
        // eslint-disable-next-line no-console
        console.warn(chalk.yellow(`Warning: Workspace is in status ${status}. Connection might fail.`));
    }

    const ssh = new SSHService();
    const project = 'dev-project';

    // eslint-disable-next-line no-console
    console.log(chalk.green(`🚀 Teleporting to ${instanceName} (${zone})...`));
    
    // Command to run on the remote VM: attach to the shpool session
    const remoteCommand = 'shpool attach main || shpool attach';

    await ssh.connect({
      instanceName,
      zone,
      project,
      command: remoteCommand,
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
  builder: (yargs) => yargs.positional('id', {
    type: 'string',
    describe: 'ID or Name of the workspace to connect to',
    demandOption: true,
  }),
  handler: async (argv) => {
    await connectToWorkspace(argv);
    await exitCli();
  },
};
