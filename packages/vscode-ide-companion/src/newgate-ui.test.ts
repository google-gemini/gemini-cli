/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  NEWGATE_DOCTOR_COMMAND,
  NEWGATE_FOCUS_SESSION_COMMAND,
  NEWGATE_SEND_CONTEXT_COMMAND,
  NEWGATE_START_COMMAND,
  NEWGATE_START_WITH_CONTEXT_COMMAND,
  NewgateSidebarProvider,
  describeSelection,
  registerNewgateUi,
  resetTrackedNewgateTerminals,
} from './newgate-ui.js';
import { newgateControllerLedgerPath } from './newgate-controller-ledger.js';

vi.mock('vscode', () => {
  class MockTreeItem {
    label: string;
    collapsibleState: number;
    description?: string;
    tooltip?: string;
    iconPath?: unknown;
    contextValue?: string;
    command?: { command: string; title: string };

    constructor(label: string, collapsibleState: number) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class MockThemeIcon {
    readonly id: string;

    constructor(id: string) {
      this.id = id;
    }
  }

  class MockEventEmitter<T> {
    readonly event = vi.fn();
    readonly fire = vi.fn<(value?: T) => void>();
    readonly dispose = vi.fn();
  }

  const disposable = () => ({ dispose: vi.fn() });

  return {
    window: {
      activeTextEditor: undefined,
      onDidChangeActiveTextEditor: vi.fn(() => disposable()),
      onDidChangeTextEditorSelection: vi.fn(() => disposable()),
      onDidCloseTerminal: vi.fn(() => disposable()),
      registerTreeDataProvider: vi.fn(() => disposable()),
      terminals: [],
      showWorkspaceFolderPick: vi.fn(),
      createTerminal: vi.fn(() => ({
        show: vi.fn(),
        sendText: vi.fn(),
      })),
      showInformationMessage: vi.fn(),
    },
    workspace: {
      workspaceFolders: [],
      getWorkspaceFolder: vi.fn(),
      onDidChangeWorkspaceFolders: vi.fn(() => disposable()),
    },
    commands: {
      registerCommand: vi.fn(() => disposable()),
    },
    EventEmitter: MockEventEmitter,
    ThemeIcon: MockThemeIcon,
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState: {
      None: 0,
    },
  };
});

const vscodeWindow = vscode.window as unknown as {
  activeTextEditor: vscode.TextEditor | undefined;
  terminals: vscode.Terminal[];
};

const vscodeWorkspace = vscode.workspace as unknown as {
  workspaceFolders: vscode.WorkspaceFolder[];
};

describe('NewgateSidebarProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTrackedNewgateTerminals();
    vscodeWorkspace.workspaceFolders = [];
    vscodeWindow.activeTextEditor = undefined;
    vscodeWindow.terminals = [];
  });

  it('builds action and context items for the sidebar', () => {
    const workspaceFolder = {
      name: 'demo-workspace',
      uri: { fsPath: '/tmp/demo-workspace' },
    } as vscode.WorkspaceFolder;
    vscodeWorkspace.workspaceFolders.push(workspaceFolder);
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(
      workspaceFolder,
    );
    vscodeWindow.activeTextEditor = {
      document: {
        uri: { fsPath: '/tmp/demo-workspace/src/app.ts' },
        getText: vi.fn(() => 'selected text'),
      },
      selection: {
        isEmpty: false,
        start: { line: 2, character: 0 },
        end: { line: 3, character: 4 },
        active: { line: 3, character: 4 },
      },
    } as unknown as vscode.TextEditor;

    const provider = new NewgateSidebarProvider();
    const items = provider.getChildren();

    expect(items).toHaveLength(10);
    expect(items[0].label).toBe('Start With Context');
    expect(items[0].command?.command).toBe(NEWGATE_START_WITH_CONTEXT_COMMAND);
    expect(items[1].label).toBe('Send Context');
    expect(items[1].command?.command).toBe(NEWGATE_SEND_CONTEXT_COMMAND);
    expect(items[2].label).toBe('Focus Session');
    expect(items[2].command?.command).toBe(NEWGATE_FOCUS_SESSION_COMMAND);
    expect(items[3].label).toBe('Start Newgate');
    expect(items[3].command?.command).toBe(NEWGATE_START_COMMAND);
    expect(items[6].label).toBe('Session');
    expect(items[6].description).toBe('Not running');
    expect(items[7].label).toBe('Workspace');
    expect(items[7].description).toBe('demo-workspace');
    expect(items[8].description).toBe('app.ts');
    expect(items[9].description).toBe('2 lines, 13 chars');
  });

  it('updates session status after starting Newgate', async () => {
    const terminal = {
      name: 'Newgate (demo-workspace)',
      show: vi.fn(),
      sendText: vi.fn(),
    };
    vi.mocked(vscode.window.createTerminal).mockReturnValue(
      terminal as unknown as vscode.Terminal,
    );

    const workspaceFolder = {
      name: 'demo-workspace',
      uri: { fsPath: '/tmp/demo-workspace' },
    } as vscode.WorkspaceFolder;
    vscodeWorkspace.workspaceFolders.push(workspaceFolder);
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(
      workspaceFolder,
    );
    vscodeWindow.activeTextEditor = {
      document: {
        uri: { fsPath: '/tmp/demo-workspace/src/app.ts' },
      },
      selection: {
        isEmpty: true,
        active: { line: 0, character: 0 },
      },
    } as unknown as vscode.TextEditor;

    const provider = new NewgateSidebarProvider();
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    registerNewgateUi(context, provider);

    const startHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((call) => call[0] === NEWGATE_START_COMMAND)?.[1];

    expect(provider.getChildren()[6].description).toBe('Not running');
    expect(startHandler).toBeTypeOf('function');

    await (startHandler as () => Promise<void>)();

    expect(provider.getChildren()[6].description).toBe('Running');
  });

  it('summarizes an empty selection as a cursor position', () => {
    const summary = describeSelection({
      selection: {
        isEmpty: true,
        active: { line: 4, character: 2 },
      },
    } as vscode.TextEditor);

    expect(summary).toBe('Cursor at L5:3');
  });

  it('runs Newgate commands in the active workspace terminal', async () => {
    const terminal = {
      show: vi.fn(),
      sendText: vi.fn(),
    };
    vi.mocked(vscode.window.createTerminal).mockReturnValue(
      terminal as unknown as vscode.Terminal,
    );
    vscodeWindow.terminals.push(terminal as unknown as vscode.Terminal);

    const workspaceFolder = {
      name: 'demo-workspace',
      uri: { fsPath: '/tmp/demo-workspace' },
    } as vscode.WorkspaceFolder;
    vscodeWorkspace.workspaceFolders.push(workspaceFolder);
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(
      workspaceFolder,
    );
    vscodeWindow.activeTextEditor = {
      document: {
        uri: { fsPath: '/tmp/demo-workspace/src/app.ts' },
      },
    } as unknown as vscode.TextEditor;

    const provider = new NewgateSidebarProvider();
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    registerNewgateUi(context, provider);

    const startHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((call) => call[0] === NEWGATE_START_COMMAND)?.[1];

    expect(startHandler).toBeTypeOf('function');
    await (startHandler as () => Promise<void>)();

    expect(vscode.window.createTerminal).toHaveBeenCalledWith({
      name: 'Newgate (demo-workspace)',
      cwd: '/tmp/demo-workspace',
    });
    expect(terminal.show).toHaveBeenCalled();
    expect(terminal.sendText).toHaveBeenCalledWith('newgate');
  });

  it('starts Newgate with attached editor context', async () => {
    const terminal = {
      show: vi.fn(),
      sendText: vi.fn(),
    };
    vi.mocked(vscode.window.createTerminal).mockReturnValue(
      terminal as unknown as vscode.Terminal,
    );
    vscodeWindow.terminals.push(terminal as unknown as vscode.Terminal);

    const workspaceFolder = {
      name: 'demo workspace',
      uri: { fsPath: '/tmp/demo workspace' },
    } as vscode.WorkspaceFolder;
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(
      workspaceFolder,
    );
    vscodeWindow.activeTextEditor = {
      document: {
        uri: { scheme: 'file', fsPath: '/tmp/demo workspace/src/app.ts' },
        getText: vi.fn(() => 'const answer = 42;'),
      },
      selection: {
        isEmpty: false,
        start: { line: 9, character: 2 },
        end: { line: 11, character: 8 },
        active: { line: 11, character: 8 },
      },
    } as unknown as vscode.TextEditor;

    const provider = new NewgateSidebarProvider();
    const context = {
      subscriptions: [],
      globalStorageUri: { fsPath: '/tmp/newgate-ui-test-storage' },
    } as unknown as vscode.ExtensionContext;
    registerNewgateUi(context, provider);

    const startHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find(
        (call) => call[0] === NEWGATE_START_WITH_CONTEXT_COMMAND,
      )?.[1];

    expect(startHandler).toBeTypeOf('function');
    await (startHandler as () => Promise<void>)();

    expect(vscode.window.createTerminal).toHaveBeenCalledWith({
      name: 'Newgate (demo workspace)',
      cwd: '/tmp/demo workspace',
    });
    expect(terminal.show).toHaveBeenCalled();
    expect(terminal.sendText).toHaveBeenNthCalledWith(1, 'newgate');
    expect(terminal.sendText).toHaveBeenNthCalledWith(
      2,
      "/attach '/tmp/demo workspace/src/app.ts'",
    );
    expect(terminal.sendText.mock.calls[2]?.[0]).toMatch(
      /^\/attach '.*selection-.*\.txt'$/,
    );
    expect(terminal.sendText).toHaveBeenNthCalledWith(
      4,
      'IDE context attached from the current editor. Start by inspecting the attached active file and attached selection note, then focus this session on that scope.',
    );
  });

  it('falls back to a plain session when no active editor context exists', async () => {
    const terminal = {
      show: vi.fn(),
      sendText: vi.fn(),
    };
    vi.mocked(vscode.window.createTerminal).mockReturnValue(
      terminal as unknown as vscode.Terminal,
    );
    vscodeWindow.terminals.push(terminal as unknown as vscode.Terminal);

    const workspaceFolder = {
      name: 'demo-workspace',
      uri: { fsPath: '/tmp/demo-workspace' },
    } as vscode.WorkspaceFolder;
    vscodeWorkspace.workspaceFolders.push(workspaceFolder);
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(
      workspaceFolder,
    );

    const provider = new NewgateSidebarProvider();
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    registerNewgateUi(context, provider);

    const startHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find(
        (call) => call[0] === NEWGATE_START_WITH_CONTEXT_COMMAND,
      )?.[1];

    expect(startHandler).toBeTypeOf('function');
    await (startHandler as () => Promise<void>)();

    expect(terminal.sendText).toHaveBeenCalledTimes(1);
    expect(terminal.sendText).toHaveBeenCalledWith('newgate');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'No active editor context found. Starting a plain Newgate session.',
    );
  });

  it('sends context to an existing Newgate session without creating a new terminal', async () => {
    const terminal = {
      name: 'Newgate (demo workspace)',
      show: vi.fn(),
      sendText: vi.fn(),
    };
    vi.mocked(vscode.window.createTerminal).mockReturnValue(
      terminal as unknown as vscode.Terminal,
    );
    vscodeWindow.terminals.push(terminal as unknown as vscode.Terminal);

    const workspaceFolder = {
      name: 'demo workspace',
      uri: { fsPath: '/tmp/demo workspace' },
    } as vscode.WorkspaceFolder;
    vscodeWorkspace.workspaceFolders.push(workspaceFolder);
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(
      workspaceFolder,
    );
    vscodeWindow.activeTextEditor = {
      document: {
        uri: { scheme: 'file', fsPath: '/tmp/demo workspace/src/app.ts' },
        getText: vi.fn(() => 'const answer = 42;'),
      },
      selection: {
        isEmpty: false,
        start: { line: 1, character: 0 },
        end: { line: 1, character: 6 },
        active: { line: 1, character: 6 },
      },
    } as unknown as vscode.TextEditor;

    const provider = new NewgateSidebarProvider();
    const context = {
      subscriptions: [],
      globalStorageUri: { fsPath: '/tmp/newgate-ui-test-storage' },
    } as unknown as vscode.ExtensionContext;
    registerNewgateUi(context, provider);

    const startHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((call) => call[0] === NEWGATE_START_COMMAND)?.[1];
    const sendContextHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((call) => call[0] === NEWGATE_SEND_CONTEXT_COMMAND)?.[1];

    expect(startHandler).toBeTypeOf('function');
    expect(sendContextHandler).toBeTypeOf('function');

    await (startHandler as () => Promise<void>)();
    await (sendContextHandler as () => Promise<void>)();

    expect(vscode.window.createTerminal).toHaveBeenCalledTimes(1);
    expect(terminal.show).toHaveBeenCalledTimes(2);
    expect(terminal.sendText).toHaveBeenNthCalledWith(1, 'newgate');
    expect(terminal.sendText).toHaveBeenNthCalledWith(
      2,
      "/attach '/tmp/demo workspace/src/app.ts'",
    );
    expect(terminal.sendText.mock.calls[2]?.[0]).toMatch(
      /^\/attach '.*selection-.*\.txt'$/,
    );
    expect(terminal.sendText).toHaveBeenNthCalledWith(
      4,
      'IDE context attached from the current editor. Start by inspecting the attached active file and attached selection note, then focus this session on that scope.',
    );
  });

  it('focuses an existing Newgate session', async () => {
    const terminal = {
      name: 'Newgate (demo workspace)',
      show: vi.fn(),
      sendText: vi.fn(),
    };
    vi.mocked(vscode.window.createTerminal).mockReturnValue(
      terminal as unknown as vscode.Terminal,
    );
    vscodeWindow.terminals.push(terminal as unknown as vscode.Terminal);

    const workspaceFolder = {
      name: 'demo workspace',
      uri: { fsPath: '/tmp/demo workspace' },
    } as vscode.WorkspaceFolder;
    vscodeWorkspace.workspaceFolders.push(workspaceFolder);
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(
      workspaceFolder,
    );
    vscodeWindow.activeTextEditor = {
      document: {
        uri: { fsPath: '/tmp/demo workspace/src/app.ts' },
      },
    } as unknown as vscode.TextEditor;

    const provider = new NewgateSidebarProvider();
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    registerNewgateUi(context, provider);

    const startHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((call) => call[0] === NEWGATE_START_COMMAND)?.[1];
    const focusHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find(
        (call) => call[0] === NEWGATE_FOCUS_SESSION_COMMAND,
      )?.[1];

    expect(startHandler).toBeTypeOf('function');
    expect(focusHandler).toBeTypeOf('function');

    await (startHandler as () => Promise<void>)();
    await (focusHandler as () => Promise<void>)();

    expect(vscode.window.createTerminal).toHaveBeenCalledTimes(1);
    expect(terminal.show).toHaveBeenCalledTimes(2);
    expect(terminal.sendText).toHaveBeenCalledTimes(1);
    expect(terminal.sendText).toHaveBeenCalledWith('newgate');
  });

  it('shows a message when sending context without a running Newgate session', async () => {
    const workspaceFolder = {
      name: 'demo workspace',
      uri: { fsPath: '/tmp/demo workspace' },
    } as vscode.WorkspaceFolder;
    vscodeWorkspace.workspaceFolders.push(workspaceFolder);
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(
      workspaceFolder,
    );
    vscodeWindow.activeTextEditor = {
      document: {
        uri: { scheme: 'file', fsPath: '/tmp/demo workspace/src/app.ts' },
        getText: vi.fn(() => 'const answer = 42;'),
      },
      selection: {
        isEmpty: false,
        start: { line: 1, character: 0 },
        end: { line: 1, character: 6 },
        active: { line: 1, character: 6 },
      },
    } as unknown as vscode.TextEditor;

    const provider = new NewgateSidebarProvider();
    const context = {
      subscriptions: [],
      globalStorageUri: { fsPath: '/tmp/newgate-ui-test-storage' },
    } as unknown as vscode.ExtensionContext;
    registerNewgateUi(context, provider);

    const sendContextHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((call) => call[0] === NEWGATE_SEND_CONTEXT_COMMAND)?.[1];

    expect(sendContextHandler).toBeTypeOf('function');
    await (sendContextHandler as () => Promise<void>)();

    expect(vscode.window.createTerminal).not.toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'No running Newgate terminal found for this workspace. Start Newgate first or use Start With Context.',
    );
  });

  it('shows a message when focusing without a running Newgate session', async () => {
    const workspaceFolder = {
      name: 'demo workspace',
      uri: { fsPath: '/tmp/demo workspace' },
    } as vscode.WorkspaceFolder;
    vscodeWorkspace.workspaceFolders.push(workspaceFolder);
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(
      workspaceFolder,
    );
    vscodeWindow.activeTextEditor = {
      document: {
        uri: { fsPath: '/tmp/demo workspace/src/app.ts' },
      },
    } as unknown as vscode.TextEditor;

    const provider = new NewgateSidebarProvider();
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    registerNewgateUi(context, provider);

    const focusHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find(
        (call) => call[0] === NEWGATE_FOCUS_SESSION_COMMAND,
      )?.[1];

    expect(focusHandler).toBeTypeOf('function');
    await (focusHandler as () => Promise<void>)();

    expect(vscode.window.createTerminal).not.toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'No running Newgate terminal found for this workspace. Start Newgate first or use Start With Context.',
    );
  });

  it('shows a message when doctor is invoked without a workspace', async () => {
    const provider = new NewgateSidebarProvider();
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    registerNewgateUi(context, provider);

    const doctorHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((call) => call[0] === NEWGATE_DOCTOR_COMMAND)?.[1];

    expect(doctorHandler).toBeTypeOf('function');
    await (doctorHandler as () => Promise<void>)();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'No folder open. Please open a folder to run Newgate.',
    );
  });

  it('writes a persistent controller ledger when starting Newgate', async () => {
    const storageRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'newgate-ui-ledger-'),
    );
    const terminal = {
      name: 'Newgate (demo-workspace)',
      show: vi.fn(),
      sendText: vi.fn(),
    };
    vi.mocked(vscode.window.createTerminal).mockReturnValue(
      terminal as unknown as vscode.Terminal,
    );

    const workspaceFolder = {
      name: 'demo-workspace',
      uri: { fsPath: '/tmp/demo-workspace' },
    } as vscode.WorkspaceFolder;
    vscodeWorkspace.workspaceFolders.push(workspaceFolder);
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(
      workspaceFolder,
    );
    vscodeWindow.activeTextEditor = {
      document: {
        uri: { fsPath: '/tmp/demo-workspace/src/app.ts' },
      },
      selection: {
        isEmpty: true,
        active: { line: 0, character: 0 },
      },
    } as unknown as vscode.TextEditor;

    try {
      const provider = new NewgateSidebarProvider();
      const context = {
        subscriptions: [],
        globalStorageUri: { fsPath: storageRoot },
      } as unknown as vscode.ExtensionContext;
      registerNewgateUi(context, provider);

      const startHandler = vi
        .mocked(vscode.commands.registerCommand)
        .mock.calls.find((call) => call[0] === NEWGATE_START_COMMAND)?.[1];

      expect(startHandler).toBeTypeOf('function');
      await (startHandler as () => Promise<void>)();

      const ledgerPath = newgateControllerLedgerPath(context);
      const ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8')) as {
        workspaces: Record<
          string,
          {
            terminalName: string;
            sessionStatus: string;
            chosenRuntime: string;
          }
        >;
      };

      expect(ledger.workspaces['/tmp/demo-workspace']).toMatchObject({
        terminalName: 'Newgate (demo-workspace)',
        sessionStatus: 'running',
        chosenRuntime: 'gemini-acp',
      });
    } finally {
      await fs.rm(storageRoot, { recursive: true, force: true });
    }
  });
});
