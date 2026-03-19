/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkspaceHubClient } from '@google/gemini-cli-core';
import chalk from 'chalk';

export async function runRemoteCommand(args: string[]): Promise<void> {
  const command = args[0];
  const hubUrl =
    process.env['GEMINI_WORKSPACE_HUB_URL'] || 'http://localhost:8080';
  const client = new WorkspaceHubClient(hubUrl);

  try {
    if (command === 'list' || command === 'ls') {
      const workspaces = await client.listWorkspaces();
      if (workspaces.length === 0) {
        // eslint-disable-next-line no-console
        console.log('No active workspaces found.');
        return;
      }
      // eslint-disable-next-line no-console
      console.log(chalk.bold('Active Workspaces:'));
      // eslint-disable-next-line no-console
      console.log(
        '------------------------------------------------------------',
      );
      for (const ws of workspaces) {
        const statusColor = ws.status === 'READY' ? chalk.green : chalk.yellow;
        // eslint-disable-next-line no-console
        console.log(
          `${chalk.cyan(ws.name.padEnd(20))} | ${statusColor(ws.status.padEnd(12))} | ${ws.id}`,
        );
      }
      // eslint-disable-next-line no-console
      console.log(
        '------------------------------------------------------------',
      );
    } else if (command === 'create') {
      const name = args[1];
      if (!name) {
        // eslint-disable-next-line no-console
        console.error(
          chalk.red(
            'Error: Workspace name is required. Usage: wsr create <name>',
          ),
        );
        process.exit(1);
      }
      // eslint-disable-next-line no-console
      console.log(
        chalk.yellow(`Requesting creation of workspace "${name}"...`),
      );
      const ws = await client.createWorkspace(name);
      // eslint-disable-next-line no-console
      console.log(chalk.green(`✅ Workspace created successfully!`));
      // eslint-disable-next-line no-console
      console.log(`${chalk.bold('ID:')}   ${ws.id}`);
      // eslint-disable-next-line no-console
      console.log(`${chalk.bold('Name:')} ${ws.name}`);
    } else if (command === 'delete' || command === 'rm') {
      const id = args[1];
      if (!id) {
        // eslint-disable-next-line no-console
        console.error(
          chalk.red('Error: Workspace ID is required. Usage: wsr delete <id>'),
        );
        process.exit(1);
      }
      // eslint-disable-next-line no-console
      console.log(chalk.yellow(`Deleting workspace "${id}"...`));
      await client.deleteWorkspace(id);
      // eslint-disable-next-line no-console
      console.log(chalk.green(`✅ Workspace deleted successfully.`));
    } else {
      // eslint-disable-next-line no-console
      console.log('Usage: wsr <command> [args]');
      // eslint-disable-next-line no-console
      console.log('Commands: list, create, delete');
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(chalk.red('Remote command failed:'), message);
    process.exit(1);
  }
}
