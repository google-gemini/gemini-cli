/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';

export function createLogger(
  context: vscode.ExtensionContext,
  logger: vscode.OutputChannel,
) {
  return (message: string) => {
    const isDevMode =
      context.extensionMode === vscode.ExtensionMode.Development;
    const isLoggingEnabled = vscode.workspace
      .getConfiguration('gemini-cli.debug')
      .get('logging.enabled');

    if (isDevMode || isLoggingEnabled) {
      logger.appendLine(message);
    }
  };
}
