/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';

export function getMaxRecentFiles() {
  return parseInt(process.env['IDE_MODE_MAX_RECENT_FILES'] ?? '', 10) || 10;
}

interface RecentFile {
  uri: vscode.Uri;
  timestamp: number;
}

/**
 * Keeps track of the MAX_RECENT_FILES # of recently-opened files. If a file
 * is closed or deleted, it will be removed. If the length is maxxed out,
 * the now-removed file will not be replaced by an older file.
 */
export class RecentFilesManager {
  private readonly files: RecentFile[] = [];
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  private readonly maxRecentFiles: number;

  constructor(
    private readonly context: vscode.ExtensionContext,
    maxRecentFiles?: number,
  ) {
    this.maxRecentFiles = maxRecentFiles ?? getMaxRecentFiles();
    const editorWatcher = vscode.window.onDidChangeActiveTextEditor(
      (editor) => {
        if (editor) {
          this.add(editor.document.uri);
        }
      },
    );
    const fileWatcher = vscode.workspace.onDidDeleteFiles((event) => {
      for (const uri of event.files) {
        this.remove(uri);
      }
    });
    const closeWatcher = vscode.workspace.onDidCloseTextDocument((document) => {
      this.remove(document.uri);
    });
    context.subscriptions.push(editorWatcher, fileWatcher, closeWatcher);
  }

  private remove(uri: vscode.Uri) {
    const index = this.files.findIndex(
      (file) => file.uri.fsPath === uri.fsPath,
    );
    if (index !== -1) {
      this.files.splice(index, 1);
      this.onDidChangeEmitter.fire();
    }
  }

  add(uri: vscode.Uri) {
    // Remove if it already exists to avoid duplicates and move it to the top.
    this.remove(uri);

    this.files.unshift({ uri, timestamp: Date.now() });

    if (this.files.length > this.maxRecentFiles) {
      this.files.pop();
    }
    this.onDidChangeEmitter.fire();
  }

  get recentFiles(): { filePath: string; timestamp: number }[] {
    return this.files.map((file) => ({
      filePath: file.uri.fsPath,
      timestamp: file.timestamp,
    }));
  }
}
