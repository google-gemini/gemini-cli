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
  ideServer = new IDEServer(logger);
  try {
    await ideServer.start(context);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
  }
}

export function deactivate() {
  if (ideServer) {
    return ideServer.stop().finally(() => {
      if (logger) {
        logger.dispose();
      }
    });
  }
  if (logger) {
    logger.dispose();
  }
}
