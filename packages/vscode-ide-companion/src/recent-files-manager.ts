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
 * opened less than 5 min ago. If a file is closed or deleted,
 * it will be removed. If the max length is reached, older files will get removed first.
 */
export class RecentFilesManager {
  private readonly files: RecentFile[] = [];
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private debounceTimer: NodeJS.Timeout | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    const editorWatcher = vscode.window.onDidChangeActiveTextEditor(
      (editor) => {
        if (editor) {
          this.add(editor.document.uri);
        }
      },
    );
    const deleteWatcher = vscode.workspace.onDidDeleteFiles((event) => {
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

    const selectionWatcher = vscode.window.onDidChangeTextEditorSelection(
      () => {
        this.fireWithDebounce();
      },
    );

    context.subscriptions.push(
      editorWatcher,
      deleteWatcher,
      closeWatcher,
      renameWatcher,
      selectionWatcher,
    );
  }

  private fireWithDebounce() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.onDidChangeEmitter.fire();
    }, 50); // 50ms
  }

  private remove(uri: vscode.Uri, fireEvent = true) {
    const index = this.files.findIndex(
      (file) => file.uri.fsPath === uri.fsPath,
    );
    if (index !== -1) {
      this.files.splice(index, 1);
      if (fireEvent) {
        this.fireWithDebounce();
      }
    }
  }

  add(uri: vscode.Uri) {
    if (uri.scheme !== 'file') {
      return;
    }

    this.remove(uri, false);
    this.files.unshift({ uri, timestamp: Date.now() });

    if (this.files.length > MAX_FILES) {
      this.files.pop();
    }
    this.fireWithDebounce();
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
