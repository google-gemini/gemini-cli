/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { isExcludedIdeContextFile } from '@google/gemini-cli-core/src/ide/ideContext.js';
import type {
  File,
  IdeContext,
} from '@google/gemini-cli-core/src/ide/types.js';

export const MAX_FILES = 10;
const MAX_SELECTED_TEXT_LENGTH = 16384; // 16 KiB limit

/**
 * Keeps track of the workspace state, including open files, cursor position, and selected text.
 */
export class OpenFilesManager implements vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private readonly subscriptions: vscode.Disposable[] = [];
  private debounceTimer: NodeJS.Timeout | undefined;
  private pendingSelectionEditor: vscode.TextEditor | undefined;
  private openFiles: File[] = [];

  constructor(_context?: vscode.ExtensionContext) {
    const editorWatcher = vscode.window.onDidChangeActiveTextEditor(
      (editor) => {
        if (editor && this.isFileUri(editor.document.uri)) {
          this.addOrMoveToFront(editor);
          this.fireWithDebounce();
        }
      },
    );

    const selectionWatcher = vscode.window.onDidChangeTextEditorSelection(
      (event) => {
        if (this.isFileUri(event.textEditor.document.uri)) {
          this.pendingSelectionEditor = event.textEditor;
          this.fireWithDebounce();
        }
      },
    );

    const closeWatcher = vscode.workspace.onDidCloseTextDocument((document) => {
      if (this.isFileUri(document.uri)) {
        this.remove(document.uri);
        this.fireWithDebounce();
      }
    });

    const deleteWatcher = vscode.workspace.onDidDeleteFiles((event) => {
      for (const uri of event.files) {
        if (this.isFileUri(uri)) {
          this.remove(uri);
        }
      }
      this.fireWithDebounce();
    });

    const renameWatcher = vscode.workspace.onDidRenameFiles((event) => {
      for (const { oldUri, newUri } of event.files) {
        if (this.isFileUri(oldUri)) {
          if (this.isFileUri(newUri)) {
            this.rename(oldUri, newUri);
          } else {
            // The file was renamed to a non-file URI, so we should remove it.
            this.remove(oldUri);
          }
        }
      }
      this.fireWithDebounce();
    });

    this.subscriptions.push(
      editorWatcher,
      selectionWatcher,
      closeWatcher,
      deleteWatcher,
      renameWatcher,
    );

    // Just add current active file on start-up.
    if (
      vscode.window.activeTextEditor &&
      this.isFileUri(vscode.window.activeTextEditor.document.uri)
    ) {
      this.addOrMoveToFront(vscode.window.activeTextEditor);
    }
  }

  dispose() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    this.pendingSelectionEditor = undefined;
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.subscriptions.length = 0;
    this.onDidChangeEmitter.dispose();
  }

  private isFileUri(uri: vscode.Uri): boolean {
    return uri.scheme === 'file' && !isExcludedIdeContextFile(uri.fsPath);
  }

  private flushPendingSelection() {
    if (this.pendingSelectionEditor) {
      const editor = this.pendingSelectionEditor;
      this.pendingSelectionEditor = undefined;
      this.updateActiveContext(editor);
    }
  }

  private addOrMoveToFront(editor: vscode.TextEditor) {
    this.pendingSelectionEditor = undefined;
    // Deactivate previous active file
    const currentActive = this.openFiles.find((f) => f.isActive);
    if (currentActive) {
      currentActive.isActive = false;
      currentActive.cursor = undefined;
      currentActive.selectedText = undefined;
    }

    // Remove if it exists
    const index = this.openFiles.findIndex(
      (f) => f.path === editor.document.uri.fsPath,
    );
    if (index !== -1) {
      this.openFiles.splice(index, 1);
    }

    // Add to the front as active
    this.openFiles.unshift({
      path: editor.document.uri.fsPath,
      timestamp: Date.now(),
      isActive: true,
    });

    // Enforce max length
    if (this.openFiles.length > MAX_FILES) {
      this.openFiles.pop();
    }

    this.updateActiveContext(editor);
  }

  private remove(uri: vscode.Uri) {
    this.flushPendingSelection();
    const index = this.openFiles.findIndex((f) => f.path === uri.fsPath);
    if (index !== -1) {
      this.openFiles.splice(index, 1);
    }
  }

  private rename(oldUri: vscode.Uri, newUri: vscode.Uri) {
    this.flushPendingSelection();
    const index = this.openFiles.findIndex((f) => f.path === oldUri.fsPath);
    if (index !== -1) {
      this.openFiles[index].path = newUri.fsPath;
    }
  }

  private updateActiveContext(editor: vscode.TextEditor) {
    const file = this.openFiles.find(
      (f) => f.path === editor.document.uri.fsPath,
    );
    if (!file || !file.isActive) {
      return;
    }

    file.cursor = editor.selection.active
      ? {
          line: editor.selection.active.line + 1,
          character: editor.selection.active.character + 1,
        }
      : undefined;

    let selectedText: string | undefined;
    try {
      selectedText =
        editor.selection.isEmpty || editor.document.isClosed
          ? undefined
          : editor.document.getText(editor.selection) || undefined;
    } catch {
      selectedText = undefined;
    }
    if (selectedText && selectedText.length > MAX_SELECTED_TEXT_LENGTH) {
      selectedText = selectedText.substring(0, MAX_SELECTED_TEXT_LENGTH);
    }
    file.selectedText = selectedText;
  }

  private fireWithDebounce() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.flushPendingSelection();
      this.onDidChangeEmitter.fire();
    }, 50); // 50ms
  }

  get state(): IdeContext {
    this.flushPendingSelection();
    return {
      workspaceState: {
        openFiles: [...this.openFiles],
        isTrusted: vscode.workspace.isTrusted,
      },
    };
  }
}
