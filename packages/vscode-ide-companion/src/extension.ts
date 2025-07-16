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
  logger = vscode.window.createOutputChannel('Gemini CLI Companion');
  logger.show();
  logger.appendLine('Starting Gemini CLI Companion server...');
  ideServer = new IDEServer(logger);
  ideServer.start(context);
}

export function deactivate() {
  if (ideServer) {
    logger.dispose();
    return ideServer.stop();
  }
}
