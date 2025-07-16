/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { IDEServer } from './ide-server';

let ideServer: IDEServer;

export async function activate(context: vscode.ExtensionContext) {
  ideServer = new IDEServer();
  ideServer.start(context);
}

export function deactivate() {
  if (ideServer) {
    ideServer.stop();
  }
}
