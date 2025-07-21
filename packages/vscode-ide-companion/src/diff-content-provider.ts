/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
  private content = new Map<string, string>();
  private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();

  get onDidChange(): vscode.Event<vscode.Uri> {
    return this.onDidChangeEmitter.event;
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.content.get(uri.toString()) ?? '';
  }

  setContent(uri: vscode.Uri, content: string): void {
    this.content.set(uri.toString(), content);
    this.onDidChangeEmitter.fire(uri);
  }

  deleteContent(uri: vscode.Uri): void {
    this.content.delete(uri.toString());
  }

  getContent(uri: vscode.Uri): string | undefined {
    return this.content.get(uri.toString());
  }
}
