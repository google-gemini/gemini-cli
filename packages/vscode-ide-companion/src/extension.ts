/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { IDEServer } from './ide-server';
import { DiffContentProvider } from './diff-content-provider';
import { DiffManager } from './diff-manager';

let ideServer: IDEServer;
let logger: vscode.OutputChannel;
export const DIFF_SCHEME = 'gemini-diff';

export async function activate(context: vscode.ExtensionContext) {
  logger = vscode.window.createOutputChannel('Gemini CLI IDE Companion');
  logger.show();
  logger.appendLine('Starting Gemini CLI IDE Companion server...');

  const diffContentProvider = new DiffContentProvider();
  const diffManager = new DiffManager(
    logger,
    diffContentProvider,
    (notification) => {
      ideServer.broadcastNotification(notification);
    },
  );

  context.subscriptions.push(
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

  ideServer = new IDEServer(logger, diffManager);
  try {
    await ideServer.start(context);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.appendLine(`Failed to start IDE server: ${message}`);
  }
}

export function deactivate() {
  if (ideServer) {
    logger.appendLine('Deactivating Gemini CLI IDE Companion...');
    return ideServer.stop().finally(() => {
      logger.dispose();
    });
  }
  if (logger) {
    logger.dispose();
  }
}
