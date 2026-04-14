/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from '@google/gemini-cli-core';
import type * as vscode from 'vscode';

export type NewgateControllerSessionStatus = 'running' | 'stopped' | 'unknown';

export type NewgateControllerRuntime = 'gemini-acp' | 'jules' | 'unknown';

export interface NewgateControllerLedgerEntry {
  workspaceName: string;
  workspacePath: string;
  terminalName?: string;
  sessionStatus: NewgateControllerSessionStatus;
  chosenRuntime: NewgateControllerRuntime;
  acpSessionId?: string;
  reportPaths: string[];
  julesJobIds: string[];
  lastActiveFilePath?: string;
  lastSelectionAttachmentPath?: string;
  updatedAt: string;
}

export interface NewgateControllerLedger {
  version: 1;
  workspaces: Record<string, NewgateControllerLedgerEntry>;
}

export interface NewgateControllerLedgerUpdate {
  terminalName?: string;
  sessionStatus?: NewgateControllerSessionStatus;
  chosenRuntime?: NewgateControllerRuntime;
  acpSessionId?: string;
  reportPath?: string | string[];
  julesJobId?: string | string[];
  lastActiveFilePath?: string;
  lastSelectionAttachmentPath?: string;
}

const EMPTY_LEDGER: NewgateControllerLedger = {
  version: 1,
  workspaces: {},
};

function fallbackGlobalStorageRoot(): string {
  return path.join(tmpdir(), 'gemini-cli-vscode-ide-companion');
}

export function newgateControllerLedgerPath(
  context: Pick<vscode.ExtensionContext, 'globalStorageUri'>,
): string {
  const storageRoot =
    context.globalStorageUri?.fsPath ?? fallbackGlobalStorageRoot();
  return path.join(storageRoot, 'newgate', 'controller-ledger.json');
}

function cloneLedger(ledger: NewgateControllerLedger): NewgateControllerLedger {
  return {
    version: ledger.version,
    workspaces: Object.fromEntries(
      Object.entries(ledger.workspaces).map(([key, value]) => [
        key,
        {
          ...value,
          reportPaths: [...value.reportPaths],
          julesJobIds: [...value.julesJobIds],
        },
      ]),
    ),
  };
}

function uniqueAppend(
  existing: string[],
  incoming?: string | string[],
): string[] {
  const additions = Array.isArray(incoming)
    ? incoming
    : incoming
      ? [incoming]
      : [];
  return [...new Set([...existing, ...additions])];
}

function createDefaultEntry(
  workspacePath: string,
  workspaceName: string,
): NewgateControllerLedgerEntry {
  return {
    workspaceName,
    workspacePath,
    sessionStatus: 'unknown',
    chosenRuntime: 'unknown',
    reportPaths: [],
    julesJobIds: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizeLedger(raw: unknown): NewgateControllerLedger {
  if (!raw || typeof raw !== 'object') {
    return cloneLedger(EMPTY_LEDGER);
  }

  const maybeLedger = raw as {
    version?: unknown;
    workspaces?: Record<string, Partial<NewgateControllerLedgerEntry>>;
  };

  const normalized: NewgateControllerLedger = {
    version: 1,
    workspaces: {},
  };

  if (!maybeLedger.workspaces || typeof maybeLedger.workspaces !== 'object') {
    return normalized;
  }

  for (const [workspacePath, entry] of Object.entries(maybeLedger.workspaces)) {
    const defaultEntry = createDefaultEntry(
      workspacePath,
      typeof entry?.workspaceName === 'string' && entry.workspaceName.length > 0
        ? entry.workspaceName
        : path.basename(workspacePath) || workspacePath,
    );
    normalized.workspaces[workspacePath] = {
      ...defaultEntry,
      workspaceName:
        typeof entry?.workspaceName === 'string' &&
        entry.workspaceName.length > 0
          ? entry.workspaceName
          : defaultEntry.workspaceName,
      terminalName:
        typeof entry?.terminalName === 'string' && entry.terminalName.length > 0
          ? entry.terminalName
          : undefined,
      sessionStatus:
        entry?.sessionStatus === 'running' ||
        entry?.sessionStatus === 'stopped' ||
        entry?.sessionStatus === 'unknown'
          ? entry.sessionStatus
          : 'unknown',
      chosenRuntime:
        entry?.chosenRuntime === 'gemini-acp' ||
        entry?.chosenRuntime === 'jules' ||
        entry?.chosenRuntime === 'unknown'
          ? entry.chosenRuntime
          : 'unknown',
      acpSessionId:
        typeof entry?.acpSessionId === 'string' && entry.acpSessionId.length > 0
          ? entry.acpSessionId
          : undefined,
      reportPaths: Array.isArray(entry?.reportPaths)
        ? entry.reportPaths.filter(
            (value): value is string => typeof value === 'string',
          )
        : [],
      julesJobIds: Array.isArray(entry?.julesJobIds)
        ? entry.julesJobIds.filter(
            (value): value is string => typeof value === 'string',
          )
        : [],
      lastActiveFilePath:
        typeof entry?.lastActiveFilePath === 'string' &&
        entry.lastActiveFilePath.length > 0
          ? entry.lastActiveFilePath
          : undefined,
      lastSelectionAttachmentPath:
        typeof entry?.lastSelectionAttachmentPath === 'string' &&
        entry.lastSelectionAttachmentPath.length > 0
          ? entry.lastSelectionAttachmentPath
          : undefined,
      updatedAt:
        typeof entry?.updatedAt === 'string' && entry.updatedAt.length > 0
          ? entry.updatedAt
          : new Date(0).toISOString(),
    };
  }

  return normalized;
}

export class NewgateControllerLedgerStore implements vscode.Disposable {
  private readonly ledgerFilePath: string;
  private cachedLedger: NewgateControllerLedger = cloneLedger(EMPTY_LEDGER);
  private hasLoaded = false;

  constructor(
    private readonly context: Pick<vscode.ExtensionContext, 'globalStorageUri'>,
  ) {
    this.ledgerFilePath = newgateControllerLedgerPath(context);
  }

  get path(): string {
    return this.ledgerFilePath;
  }

  async read(): Promise<NewgateControllerLedger> {
    if (this.hasLoaded) {
      return cloneLedger(this.cachedLedger);
    }

    try {
      const raw = await fs.readFile(this.ledgerFilePath, 'utf8');
      this.cachedLedger = normalizeLedger(JSON.parse(raw));
    } catch {
      this.cachedLedger = cloneLedger(EMPTY_LEDGER);
    }

    this.hasLoaded = true;
    return cloneLedger(this.cachedLedger);
  }

  async getWorkspaceState(
    workspacePath: string,
  ): Promise<NewgateControllerLedgerEntry | undefined> {
    const ledger = await this.read();
    const entry = ledger.workspaces[workspacePath];
    if (!entry) {
      return undefined;
    }
    return {
      ...entry,
      reportPaths: [...entry.reportPaths],
      julesJobIds: [...entry.julesJobIds],
    };
  }

  async recordWorkspaceState(
    workspaceFolder: vscode.WorkspaceFolder,
    update: NewgateControllerLedgerUpdate,
  ): Promise<NewgateControllerLedgerEntry> {
    const ledger = await this.read();
    const workspacePath = workspaceFolder.uri.fsPath;
    const current =
      ledger.workspaces[workspacePath] ??
      createDefaultEntry(workspacePath, workspaceFolder.name);

    const nextEntry: NewgateControllerLedgerEntry = {
      ...current,
      workspaceName: workspaceFolder.name,
      workspacePath,
      terminalName: update.terminalName ?? current.terminalName,
      sessionStatus: update.sessionStatus ?? current.sessionStatus,
      chosenRuntime: update.chosenRuntime ?? current.chosenRuntime,
      acpSessionId: update.acpSessionId ?? current.acpSessionId,
      reportPaths: uniqueAppend(current.reportPaths, update.reportPath),
      julesJobIds: uniqueAppend(current.julesJobIds, update.julesJobId),
      lastActiveFilePath:
        update.lastActiveFilePath ?? current.lastActiveFilePath,
      lastSelectionAttachmentPath:
        update.lastSelectionAttachmentPath ??
        current.lastSelectionAttachmentPath,
      updatedAt: new Date().toISOString(),
    };

    ledger.workspaces[workspacePath] = nextEntry;
    await this.write(ledger);
    return {
      ...nextEntry,
      reportPaths: [...nextEntry.reportPaths],
      julesJobIds: [...nextEntry.julesJobIds],
    };
  }

  async markSessionStopped(workspacePath: string): Promise<void> {
    const ledger = await this.read();
    const existing = ledger.workspaces[workspacePath];
    if (!existing) {
      return;
    }

    ledger.workspaces[workspacePath] = {
      ...existing,
      sessionStatus: 'stopped',
      updatedAt: new Date().toISOString(),
    };
    await this.write(ledger);
  }

  dispose(): void {
    this.cachedLedger = cloneLedger(EMPTY_LEDGER);
    this.hasLoaded = false;
  }

  private async write(ledger: NewgateControllerLedger): Promise<void> {
    this.cachedLedger = normalizeLedger(ledger);
    this.hasLoaded = true;
    await fs.mkdir(path.dirname(this.ledgerFilePath), { recursive: true });
    await fs.writeFile(
      this.ledgerFilePath,
      JSON.stringify(this.cachedLedger, null, 2),
      'utf8',
    );
  }
}
