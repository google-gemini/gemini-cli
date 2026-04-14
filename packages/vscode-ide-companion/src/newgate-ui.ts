/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { NewgateControllerLedgerStore } from './newgate-controller-ledger.js';

export const NEWGATE_VIEW_ID = 'gemini-cli.newgateView';
export const NEWGATE_START_COMMAND = 'gemini-cli.newgateStart';
export const NEWGATE_START_WITH_CONTEXT_COMMAND =
  'gemini-cli.newgateStartWithContext';
export const NEWGATE_SEND_CONTEXT_COMMAND = 'gemini-cli.newgateSendContext';
export const NEWGATE_FOCUS_SESSION_COMMAND = 'gemini-cli.newgateFocusSession';
export const NEWGATE_DOCTOR_COMMAND = 'gemini-cli.newgateDoctor';
export const NEWGATE_INIT_COMMAND = 'gemini-cli.newgateInit';
export const NEWGATE_REFRESH_COMMAND = 'gemini-cli.newgateRefresh';

const NO_WORKSPACE_MESSAGE =
  'No folder open. Please open a folder to run Newgate.';
const NO_ACTIVE_EDITOR_CONTEXT_MESSAGE =
  'No active editor context found. Starting a plain Newgate session.';
const NO_CONTEXT_TO_SEND_MESSAGE =
  'No active editor context found to send to Newgate.';
const NO_RUNNING_NEWGATE_MESSAGE =
  'No running Newgate terminal found for this workspace. Start Newgate first or use Start With Context.';

const trackedNewgateTerminals = new Map<string, vscode.Terminal>();

export function resetTrackedNewgateTerminals(): void {
  trackedNewgateTerminals.clear();
}

interface NewgateContextPayload {
  activeFilePath: string | undefined;
  selectionAttachmentPath: string | undefined;
  prompt: string | undefined;
}

function infoItem(label: string, description: string): vscode.TreeItem {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.description = description;
  item.tooltip = `${label}: ${description}`;
  item.iconPath = new vscode.ThemeIcon('info');
  item.contextValue = 'newgate.info';
  return item;
}

function actionItem(
  label: string,
  description: string,
  icon: string,
  command: string,
): vscode.TreeItem {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.description = description;
  item.tooltip = `${label}: ${description}`;
  item.iconPath = new vscode.ThemeIcon(icon);
  item.contextValue = 'newgate.action';
  item.command = {
    command,
    title: label,
  };
  return item;
}

export function describeSelection(
  editor: vscode.TextEditor | undefined,
): string {
  if (!editor) {
    return 'No active editor';
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    return `Cursor at L${selection.active.line + 1}:${selection.active.character + 1}`;
  }

  const selectedText = editor.document.getText(selection);
  const lineCount = selection.end.line - selection.start.line + 1;
  const charCount = selectedText.length;
  return `${lineCount} line${lineCount === 1 ? '' : 's'}, ${charCount} char${charCount === 1 ? '' : 's'}`;
}

function selectionRangeLabel(editor: vscode.TextEditor): string {
  const selection = editor.selection;
  return `L${selection.start.line + 1}:${selection.start.character + 1}-L${selection.end.line + 1}:${selection.end.character + 1}`;
}

function preferredWorkspaceFolder(
  folders: readonly vscode.WorkspaceFolder[] | undefined,
  editor: vscode.TextEditor | undefined,
): vscode.WorkspaceFolder | undefined {
  const activeUri = editor?.document.uri;
  if (activeUri) {
    const folder = vscode.workspace.getWorkspaceFolder(activeUri);
    if (folder) {
      return folder;
    }
  }

  if (folders?.length === 1) {
    return folders[0];
  }

  return undefined;
}

function workspaceKey(workspaceFolder: vscode.WorkspaceFolder): string {
  return workspaceFolder.uri.fsPath;
}

function newgateTerminalName(workspaceFolder: vscode.WorkspaceFolder): string {
  return `Newgate (${workspaceFolder.name})`;
}

function rememberNewgateTerminal(
  workspaceFolder: vscode.WorkspaceFolder,
  terminal: vscode.Terminal,
): void {
  trackedNewgateTerminals.set(workspaceKey(workspaceFolder), terminal);
}

function forgetNewgateTerminalAndCollectWorkspaces(
  terminal: vscode.Terminal,
): string[] {
  const removedWorkspaces: string[] = [];
  for (const [key, trackedTerminal] of trackedNewgateTerminals.entries()) {
    if (trackedTerminal === terminal) {
      trackedNewgateTerminals.delete(key);
      removedWorkspaces.push(key);
    }
  }
  return removedWorkspaces;
}

function resolveTrackedNewgateTerminal(
  workspaceFolder: vscode.WorkspaceFolder,
): vscode.Terminal | undefined {
  const trackedTerminal = trackedNewgateTerminals.get(
    workspaceKey(workspaceFolder),
  );
  if (trackedTerminal) {
    return trackedTerminal;
  }

  const discoveredTerminal = vscode.window.terminals.find(
    (terminal) => terminal.name === newgateTerminalName(workspaceFolder),
  );
  if (discoveredTerminal) {
    rememberNewgateTerminal(workspaceFolder, discoveredTerminal);
  }
  return discoveredTerminal;
}

function newgateSessionStatus(
  folders: readonly vscode.WorkspaceFolder[] | undefined,
  editor: vscode.TextEditor | undefined,
): string {
  const folder = preferredWorkspaceFolder(folders, editor);
  if (!folder) {
    return 'No workspace selected';
  }
  return resolveTrackedNewgateTerminal(folder) ? 'Running' : 'Not running';
}

export function describeActiveFile(
  editor: vscode.TextEditor | undefined,
): string {
  if (!editor) {
    return 'No active file';
  }
  return (
    path.basename(editor.document.uri.fsPath) || editor.document.uri.fsPath
  );
}

export function describeWorkspaceFolder(
  folders: readonly vscode.WorkspaceFolder[] | undefined,
  editor: vscode.TextEditor | undefined,
): string {
  const folder = preferredWorkspaceFolder(folders, editor);
  if (folder) {
    return folder.name;
  }

  if (!folders || folders.length === 0) {
    return 'No folder open';
  }

  if (folders.length === 1) {
    return folders[0].name;
  }

  return `${folders.length} folders open`;
}

async function resolveWorkspaceFolder(): Promise<
  vscode.WorkspaceFolder | undefined
> {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    const folder = vscode.workspace.getWorkspaceFolder(activeUri);
    if (folder) {
      return folder;
    }
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return undefined;
  }

  if (workspaceFolders.length === 1) {
    return workspaceFolders[0];
  }

  return vscode.window.showWorkspaceFolderPick({
    placeHolder: 'Select a folder to run Newgate in',
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function attachableActiveFilePath(
  editor: vscode.TextEditor | undefined,
): string | undefined {
  if (!editor || editor.document.uri.scheme !== 'file') {
    return undefined;
  }
  return editor.document.uri.fsPath;
}

function newgateContextRoot(context: vscode.ExtensionContext): string {
  const basePath =
    context.globalStorageUri?.fsPath ??
    path.join(process.cwd(), '.tmp-newgate-context');
  return path.join(basePath, 'newgate');
}

async function writeSelectionAttachment(
  context: vscode.ExtensionContext,
  editor: vscode.TextEditor,
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<string | undefined> {
  if (editor.selection.isEmpty) {
    return undefined;
  }

  const selectedText = editor.document.getText(editor.selection);
  const contextRoot = newgateContextRoot(context);
  await fs.mkdir(contextRoot, { recursive: true });

  const filePath = path.join(
    contextRoot,
    `selection-${Date.now()}-${editor.selection.start.line + 1}-${editor.selection.end.line + 1}.txt`,
  );
  const lines = [
    'Newgate IDE context',
    `workspace: ${workspaceFolder.name}`,
    `file: ${editor.document.uri.fsPath}`,
    `selection: ${selectionRangeLabel(editor)}`,
    '',
    'Selected text:',
    selectedText,
  ];
  await fs.writeFile(filePath, lines.join('\n'), 'utf8');
  return filePath;
}

function buildContextPrompt(
  activeFilePath: string | undefined,
  selectionAttachmentPath: string | undefined,
): string | undefined {
  if (!activeFilePath && !selectionAttachmentPath) {
    return undefined;
  }

  if (activeFilePath && selectionAttachmentPath) {
    return 'IDE context attached from the current editor. Start by inspecting the attached active file and attached selection note, then focus this session on that scope.';
  }

  if (selectionAttachmentPath) {
    return 'IDE selection context is attached from the current editor. Start by inspecting the attached selection note and focus this session on that scope.';
  }

  return 'IDE file context is attached from the current editor. Start by inspecting the attached active file and focus this session on that scope.';
}

async function collectContextPayload(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<NewgateContextPayload> {
  const editor = vscode.window.activeTextEditor;
  const activeFilePath = attachableActiveFilePath(editor);
  const selectionAttachmentPath =
    editor && !editor.selection.isEmpty
      ? await writeSelectionAttachment(context, editor, workspaceFolder)
      : undefined;

  return {
    activeFilePath,
    selectionAttachmentPath,
    prompt: buildContextPrompt(activeFilePath, selectionAttachmentPath),
  };
}

function hasContextPayload(payload: NewgateContextPayload): boolean {
  return Boolean(payload.activeFilePath || payload.selectionAttachmentPath);
}

function sendContextPayload(
  terminal: vscode.Terminal,
  payload: NewgateContextPayload,
): void {
  if (payload.activeFilePath) {
    terminal.sendText(`/attach ${shellQuote(payload.activeFilePath)}`);
  }
  if (payload.selectionAttachmentPath) {
    terminal.sendText(`/attach ${shellQuote(payload.selectionAttachmentPath)}`);
  }
  if (payload.prompt) {
    terminal.sendText(payload.prompt);
  }
}

async function recordContextPayloadInLedger(
  ledgerStore: NewgateControllerLedgerStore,
  workspaceFolder: vscode.WorkspaceFolder,
  payload: NewgateContextPayload,
): Promise<void> {
  await ledgerStore.recordWorkspaceState(workspaceFolder, {
    lastActiveFilePath: payload.activeFilePath,
    lastSelectionAttachmentPath: payload.selectionAttachmentPath,
  });
}

function createNewgateTerminal(
  workspaceFolder: vscode.WorkspaceFolder,
): vscode.Terminal {
  const terminal = vscode.window.createTerminal({
    name: newgateTerminalName(workspaceFolder),
    cwd: workspaceFolder.uri.fsPath,
  });
  rememberNewgateTerminal(workspaceFolder, terminal);
  return terminal;
}

async function startNewgateSession(
  workspaceFolder: vscode.WorkspaceFolder,
  ledgerStore: NewgateControllerLedgerStore,
): Promise<vscode.Terminal> {
  const terminal = createNewgateTerminal(workspaceFolder);
  terminal.show();
  terminal.sendText('newgate');
  await ledgerStore.recordWorkspaceState(workspaceFolder, {
    terminalName: terminal.name,
    sessionStatus: 'running',
    chosenRuntime: 'gemini-acp',
  });
  return terminal;
}

async function runNewgateStart(
  ledgerStore: NewgateControllerLedgerStore,
): Promise<void> {
  const folder = await resolveWorkspaceFolder();
  if (!folder) {
    void vscode.window.showInformationMessage(NO_WORKSPACE_MESSAGE);
    return;
  }

  await startNewgateSession(folder, ledgerStore);
}

async function runNewgateCommand(
  commandLine: string,
  terminalLabel: string,
): Promise<void> {
  const folder = await resolveWorkspaceFolder();
  if (!folder) {
    void vscode.window.showInformationMessage(NO_WORKSPACE_MESSAGE);
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: `${terminalLabel} (${folder.name})`,
    cwd: folder.uri.fsPath,
  });
  terminal.show();
  terminal.sendText(commandLine);
}

async function runNewgateWithContext(
  context: vscode.ExtensionContext,
  ledgerStore: NewgateControllerLedgerStore,
): Promise<void> {
  const folder = await resolveWorkspaceFolder();
  if (!folder) {
    void vscode.window.showInformationMessage(NO_WORKSPACE_MESSAGE);
    return;
  }

  const payload = await collectContextPayload(context, folder);
  const terminal = await startNewgateSession(folder, ledgerStore);

  if (!hasContextPayload(payload)) {
    void vscode.window.showInformationMessage(NO_ACTIVE_EDITOR_CONTEXT_MESSAGE);
    return;
  }

  sendContextPayload(terminal, payload);
  await recordContextPayloadInLedger(ledgerStore, folder, payload);
}

async function sendContextToRunningNewgate(
  context: vscode.ExtensionContext,
  ledgerStore: NewgateControllerLedgerStore,
): Promise<void> {
  const folder = await resolveWorkspaceFolder();
  if (!folder) {
    void vscode.window.showInformationMessage(NO_WORKSPACE_MESSAGE);
    return;
  }

  const payload = await collectContextPayload(context, folder);
  if (!hasContextPayload(payload)) {
    void vscode.window.showInformationMessage(NO_CONTEXT_TO_SEND_MESSAGE);
    return;
  }

  const terminal = resolveTrackedNewgateTerminal(folder);
  if (!terminal) {
    void vscode.window.showInformationMessage(NO_RUNNING_NEWGATE_MESSAGE);
    return;
  }

  terminal.show();
  sendContextPayload(terminal, payload);
  await recordContextPayloadInLedger(ledgerStore, folder, payload);
}

async function focusRunningNewgateSession(): Promise<void> {
  const folder = await resolveWorkspaceFolder();
  if (!folder) {
    void vscode.window.showInformationMessage(NO_WORKSPACE_MESSAGE);
    return;
  }

  const terminal = resolveTrackedNewgateTerminal(folder);
  if (!terminal) {
    void vscode.window.showInformationMessage(NO_RUNNING_NEWGATE_MESSAGE);
    return;
  }

  terminal.show();
}

export class NewgateSidebarProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    vscode.TreeItem | undefined | void
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor() {
    this.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
      vscode.window.onDidChangeTextEditorSelection(() => this.refresh()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh()),
    );
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element) {
      return [];
    }

    const editor = vscode.window.activeTextEditor;
    const workspaceFolders = vscode.workspace.workspaceFolders;

    return [
      actionItem(
        'Start With Context',
        'Launch Newgate and attach the current file and selection',
        'sparkle',
        NEWGATE_START_WITH_CONTEXT_COMMAND,
      ),
      actionItem(
        'Send Context',
        'Attach the current file and selection to a running Newgate session',
        'arrow-up',
        NEWGATE_SEND_CONTEXT_COMMAND,
      ),
      actionItem(
        'Focus Session',
        'Reveal the running Newgate terminal for this workspace',
        'terminal',
        NEWGATE_FOCUS_SESSION_COMMAND,
      ),
      actionItem(
        'Start Newgate',
        'Launch Newgate in the integrated terminal',
        'play-circle',
        NEWGATE_START_COMMAND,
      ),
      actionItem(
        'Run Doctor',
        'Check terminal, runtime, and verifier readiness',
        'pulse',
        NEWGATE_DOCTOR_COMMAND,
      ),
      actionItem(
        'Run Init',
        'Install launcher and shell hook if needed',
        'tools',
        NEWGATE_INIT_COMMAND,
      ),
      infoItem('Session', newgateSessionStatus(workspaceFolders, editor)),
      infoItem('Workspace', describeWorkspaceFolder(workspaceFolders, editor)),
      infoItem('Active File', describeActiveFile(editor)),
      infoItem('Selection', describeSelection(editor)),
    ];
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }
}

export function registerNewgateUi(
  context: vscode.ExtensionContext,
  provider: NewgateSidebarProvider,
): void {
  const ledgerStore = new NewgateControllerLedgerStore(context);
  context.subscriptions.push(
    provider,
    ledgerStore,
    vscode.window.registerTreeDataProvider(NEWGATE_VIEW_ID, provider),
    vscode.window.onDidCloseTerminal(async (terminal) => {
      const removedWorkspaces =
        forgetNewgateTerminalAndCollectWorkspaces(terminal);
      await Promise.all(
        removedWorkspaces.map((workspacePath) =>
          ledgerStore.markSessionStopped(workspacePath),
        ),
      );
      provider.refresh();
    }),
    vscode.commands.registerCommand(
      NEWGATE_START_WITH_CONTEXT_COMMAND,
      async () => {
        await runNewgateWithContext(context, ledgerStore);
        provider.refresh();
      },
    ),
    vscode.commands.registerCommand(NEWGATE_SEND_CONTEXT_COMMAND, async () => {
      await sendContextToRunningNewgate(context, ledgerStore);
      provider.refresh();
    }),
    vscode.commands.registerCommand(NEWGATE_FOCUS_SESSION_COMMAND, async () => {
      await focusRunningNewgateSession();
    }),
    vscode.commands.registerCommand(NEWGATE_START_COMMAND, async () => {
      await runNewgateStart(ledgerStore);
      provider.refresh();
    }),
    vscode.commands.registerCommand(NEWGATE_DOCTOR_COMMAND, async () => {
      await runNewgateCommand('newgate doctor', 'Newgate Doctor');
    }),
    vscode.commands.registerCommand(NEWGATE_INIT_COMMAND, async () => {
      await runNewgateCommand('newgate init', 'Newgate Init');
    }),
    vscode.commands.registerCommand(NEWGATE_REFRESH_COMMAND, () => {
      provider.refresh();
    }),
  );
}
