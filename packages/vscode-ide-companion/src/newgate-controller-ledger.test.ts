/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import {
  NewgateControllerLedgerStore,
  newgateControllerLedgerPath,
} from './newgate-controller-ledger.js';

vi.mock('vscode', () => ({}));

async function createTempStorageRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'newgate-ledger-'));
}

describe('NewgateControllerLedgerStore', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempRoots.map((tempRoot) =>
        fs.rm(tempRoot, { recursive: true, force: true }),
      ),
    );
    tempRoots.length = 0;
  });

  it('persists workspace controller state across store instances', async () => {
    const storageRoot = await createTempStorageRoot();
    tempRoots.push(storageRoot);
    const context = {
      globalStorageUri: { fsPath: storageRoot },
    } as Pick<vscode.ExtensionContext, 'globalStorageUri'>;
    const workspaceFolder = {
      name: 'demo-workspace',
      uri: { fsPath: '/tmp/demo-workspace' },
    } as vscode.WorkspaceFolder;

    const firstStore = new NewgateControllerLedgerStore(context);
    await firstStore.recordWorkspaceState(workspaceFolder, {
      terminalName: 'Newgate (demo-workspace)',
      sessionStatus: 'running',
      chosenRuntime: 'gemini-acp',
      acpSessionId: 'acp-session-1',
      reportPath: '/tmp/demo-workspace/.gemini/pcc-reports/report-1.json',
      julesJobId: 'jules-job-1',
      lastActiveFilePath: '/tmp/demo-workspace/src/app.ts',
      lastSelectionAttachmentPath: '/tmp/demo-workspace/.tmp/selection.txt',
    });

    const secondStore = new NewgateControllerLedgerStore(context);
    const restoredEntry = await secondStore.getWorkspaceState(
      workspaceFolder.uri.fsPath,
    );

    expect(restoredEntry).toMatchObject({
      workspaceName: 'demo-workspace',
      workspacePath: '/tmp/demo-workspace',
      terminalName: 'Newgate (demo-workspace)',
      sessionStatus: 'running',
      chosenRuntime: 'gemini-acp',
      acpSessionId: 'acp-session-1',
      reportPaths: ['/tmp/demo-workspace/.gemini/pcc-reports/report-1.json'],
      julesJobIds: ['jules-job-1'],
      lastActiveFilePath: '/tmp/demo-workspace/src/app.ts',
      lastSelectionAttachmentPath: '/tmp/demo-workspace/.tmp/selection.txt',
    });
  });

  it('deduplicates report paths and can mark sessions stopped by workspace path', async () => {
    const storageRoot = await createTempStorageRoot();
    tempRoots.push(storageRoot);
    const context = {
      globalStorageUri: { fsPath: storageRoot },
    } as Pick<vscode.ExtensionContext, 'globalStorageUri'>;
    const workspaceFolder = {
      name: 'demo-workspace',
      uri: { fsPath: '/tmp/demo-workspace' },
    } as vscode.WorkspaceFolder;

    const store = new NewgateControllerLedgerStore(context);
    await store.recordWorkspaceState(workspaceFolder, {
      sessionStatus: 'running',
      chosenRuntime: 'gemini-acp',
      reportPath: '/tmp/demo-workspace/.gemini/pcc-reports/report-1.json',
      julesJobId: 'jules-job-1',
    });
    await store.recordWorkspaceState(workspaceFolder, {
      reportPath: [
        '/tmp/demo-workspace/.gemini/pcc-reports/report-1.json',
        '/tmp/demo-workspace/.gemini/pcc-reports/report-2.json',
      ],
      julesJobId: ['jules-job-1', 'jules-job-2'],
    });
    await store.markSessionStopped(workspaceFolder.uri.fsPath);

    const ledgerPath = newgateControllerLedgerPath(context);
    const raw = JSON.parse(await fs.readFile(ledgerPath, 'utf8')) as {
      workspaces: Record<
        string,
        { reportPaths: string[]; julesJobIds: string[]; sessionStatus: string }
      >;
    };

    expect(raw.workspaces['/tmp/demo-workspace'].reportPaths).toEqual([
      '/tmp/demo-workspace/.gemini/pcc-reports/report-1.json',
      '/tmp/demo-workspace/.gemini/pcc-reports/report-2.json',
    ]);
    expect(raw.workspaces['/tmp/demo-workspace'].julesJobIds).toEqual([
      'jules-job-1',
      'jules-job-2',
    ]);
    expect(raw.workspaces['/tmp/demo-workspace'].sessionStatus).toBe('stopped');
  });
});
