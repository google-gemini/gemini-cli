/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { IDEServer } from './ide-server';
import { createLogger } from './utils/logger';

let ideServer: IDEServer;
let logger: vscode.OutputChannel;
let log: (message: string) => void;

export async function activate(context: vscode.ExtensionContext) {
  logger = vscode.window.createOutputChannel('Gemini CLI IDE Companion');
  log = createLogger(context, logger);

  log('Extension activated');
  ideServer = new IDEServer(log);
  try {
    await ideServer.start(context);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Failed to start IDE server: ${message}`);
  }
}

export async function deactivate(): Promise<void> {
  log('Extension deactivated');
  if (ideServer) {
    await ideServer.stop();
  }
  if (logger) {
    logger.dispose();
  }
}
