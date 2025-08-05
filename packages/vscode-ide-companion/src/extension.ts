/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { IDEServer } from './ide-server.js';
import { DiffContentProvider, DiffManager } from './diff-manager.js';
import { createLogger } from './utils/logger.js';

const IDE_WORKSPACE_PATH_ENV_VAR = 'GEMINI_CLI_IDE_WORKSPACE_PATH';
export const DIFF_SCHEME = 'gemini-diff';

let ideServer: IDEServer;
let logger: vscode.OutputChannel;

let log: (message: string) => void = () => {};

function updateWorkspacePath(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length === 1) {
    const workspaceFolder = workspaceFolders[0];
    context.environmentVariableCollection.replace(
      IDE_WORKSPACE_PATH_ENV_VAR,
      workspaceFolder.uri.fsPath,
    );
  } else {
    context.environmentVariableCollection.replace(
      IDE_WORKSPACE_PATH_ENV_VAR,
      '',
    );
  }
}

export async function activate(context: vscode.ExtensionContext) {
  logger = vscode.window.createOutputChannel('Gemini CLI IDE Companion');
  log = createLogger(context, logger);
  log('Extension activated');

  updateWorkspacePath(context);

  const diffContentProvider = new DiffContentProvider();
  const diffManager = new DiffManager(logger, diffContentProvider);

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      if (doc.uri.scheme === DIFF_SCHEME) {
        diffManager.cancelDiff(doc.uri);
      }
    }),
    vscode.workspace.registerTextDocumentContentProvider(
      DIFF_SCHEME,
      diffContentProvider,
    ),
    vscode.commands.registerCommand(
      'gemini.diff.accept',
      (uri?: vscode.Uri) => {
        const docUri = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (docUri && docUri.scheme === DIFF_SCHEME) {
          diffManager.acceptDiff(docUri);
        }
      },
    ),
    vscode.commands.registerCommand(
      'gemini.diff.cancel',
      (uri?: vscode.Uri) => {
        const docUri = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (docUri && docUri.scheme === DIFF_SCHEME) {
          diffManager.cancelDiff(docUri);
        }
      },
    ),
  );

  ideServer = new IDEServer(log, diffManager);
  try {
    await ideServer.start(context);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Failed to start IDE server: ${message}`);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      updateWorkspacePath(context);
    }),
    vscode.commands.registerCommand('gemini-cli.runGeminiCLI', () => {
      const geminiCmd = 'gemini';
      const terminal = vscode.window.createTerminal(`Gemini CLI`);
      terminal.show();
      terminal.sendText(geminiCmd);
    }),
    vscode.commands.registerCommand('gemini-cli.showNotices', async () => {
      const noticePath = vscode.Uri.joinPath(
        context.extensionUri,
        'NOTICES.txt',
      );
      await vscode.window.showTextDocument(noticePath);
    }),
  );
}

export async function deactivate(): Promise<void> {
  log('Extension deactivated');
  try {
    if (ideServer) {
      await ideServer.stop();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Failed to stop IDE server during deactivation: ${message}`);
  } finally {
    if (logger) {
      logger.dispose();
    }
  }
}
