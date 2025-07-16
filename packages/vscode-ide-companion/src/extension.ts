/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as vscode from 'vscode';
import { startIDEServer } from './ide-server';

export async function activate(context: vscode.ExtensionContext) {
  startIDEServer(context);
}

export function deactivate() {}
