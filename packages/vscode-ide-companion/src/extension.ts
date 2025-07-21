/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { IDEServer } from './ide-server';

let ideServer: IDEServer;
let logger: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext) {
  logger = vscode.window.createOutputChannel('Gemini CLI IDE Companion');
  logger.appendLine('Starting Gemini CLI IDE Companion server...');
  ideServer = new IDEServer(logger);
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
