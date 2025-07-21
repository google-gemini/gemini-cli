/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';

export const MAX_FILES = 10;
export const MAX_FILE_AGE_MINUTES = 5;

interface RecentFile {
  uri: vscode.Uri;
  timestamp: number;
}

/**
 * Keeps track of the 10 most recently-opened files
 * opened less than 5 ago. If a file is closed or deleted,
 * it will be removed. If the length is maxxed out,
 * the now-removed file will not be replaced by an older file.
 */
export class RecentFilesManager {
  private readonly files: RecentFile[] = [];
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {
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
    const renameWatcher = vscode.workspace.onDidRenameFiles((event) => {
      for (const { oldUri, newUri } of event.files) {
        this.remove(oldUri, false);
        this.add(newUri);
      }
    });
    context.subscriptions.push(
      editorWatcher,
      fileWatcher,
      closeWatcher,
      renameWatcher,
    );
  }

  private remove(uri: vscode.Uri, fireEvent = true) {
    const index = this.files.findIndex(
      (file) => file.uri.fsPath === uri.fsPath,
    );
    if (index !== -1) {
      this.files.splice(index, 1);
      if (fireEvent) {
        this.onDidChangeEmitter.fire();
      }
    }
  }

  add(uri: vscode.Uri) {
    // Remove if it already exists to avoid duplicates and move it to the top.
    this.remove(uri, false);

    this.files.unshift({ uri, timestamp: Date.now() });

    if (this.files.length > MAX_FILES) {
      this.files.pop();
    }
    this.onDidChangeEmitter.fire();
  }

  get recentFiles(): Array<{ filePath: string; timestamp: number }> {
    const now = Date.now();
    const maxAgeInMs = MAX_FILE_AGE_MINUTES * 60 * 1000;
    return this.files
      .filter((file) => now - file.timestamp < maxAgeInMs)
      .map((file) => ({
        filePath: file.uri.fsPath,
        timestamp: file.timestamp,
      }));
  }
}
