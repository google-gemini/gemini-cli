/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import * as assert from 'node:assert';

/* eslint-disable no-console */

/**
 * Waits for a specific amount of time.
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Checks if a terminal with the given name is active.
 */
function isTerminalActive(name: string): boolean {
  return vscode.window.activeTerminal?.name === name;
}

/**
 * Waits for the diff view for the given file to open.
 */
async function waitForDiffVisible(filePath: string): Promise<void> {
  const isVisible = () => {
    for (const tabGroup of vscode.window.tabGroups.all) {
      for (const tab of tabGroup.tabs) {
        if (
          tab.input instanceof vscode.TabInputTextDiff &&
          tab.input.modified.path.endsWith(filePath)
        ) {
          return true;
        }
      }
    }
    return false;
  };

  if (isVisible()) return;

  return new Promise((resolve) => {
    const disposable = vscode.window.tabGroups.onDidChangeTabs(() => {
      if (isVisible()) {
        disposable.dispose();
        resolve();
      }
    });
  });
}

export async function runTest() {
  const TERMINAL_NAME = 'Gemini E2E Terminal';

  console.log(
    'Running: should maintain focus in the terminal after accepting a diff',
  );

  // 1. Ensure the extension is activated
  const extension = vscode.extensions.getExtension(
    'google.gemini-cli-vscode-ide-companion',
  );
  if (!extension) {
    throw new Error('Extension not found');
  }
  await extension.activate();

  // 2. Open a dummy file and EXPLICITLY FOCUS it.
  const dummyUri = vscode.Uri.parse('untitled:dummy.ts');
  const dummyDoc = await vscode.workspace.openTextDocument(dummyUri);
  await vscode.window.showTextDocument(dummyDoc, {
    viewColumn: vscode.ViewColumn.One,
    preview: false,
  });
  await sleep(1000);
  console.log(
    `Dummy editor opened and focused. Active editor: ${vscode.window.activeTextEditor?.document.uri.toString()}`,
  );

  // 3. Create and show a terminal (focusing it)
  const terminal = vscode.window.createTerminal(TERMINAL_NAME);
  terminal.show(false); // false means 'take focus'

  // Wait for terminal to stabilize and take focus
  await sleep(2000);
  assert.strictEqual(
    isTerminalActive(TERMINAL_NAME),
    true,
    'Terminal should be active/focused',
  );
  console.log('Terminal focused.');

  // 4. Open a diff
  const testFile = 'e2e-test-file.ts';
  await vscode.commands.executeCommand('gemini.diff.open', {
    filePath: testFile,
    newContent: '// Modified in E2E test',
  });

  // 5. Wait for the diff tab to appear
  await waitForDiffVisible(testFile);
  console.log('Diff is visible.');

  // 6. Accept the diff (triggering the close logic)
  console.log('Accepting diff...');
  await vscode.commands.executeCommand('gemini.diff.accept');

  // 7. Verify focus: Attempt to "type" into the editor area.
  await sleep(3000);

  console.log('Attempting to type "FOCUS_TEST" to probe focus...');
  await vscode.commands.executeCommand('default:type', { text: 'FOCUS_TEST' });

  // Wait for potential document change
  await sleep(1000);

  const content = dummyDoc.getText();
  console.log(`Dummy document content after probe: "${content}"`);

  if (content.includes('FOCUS_TEST')) {
    throw new Error(
      'Terminal LOST FOCUS! Keyboard input reached the dummy editor.',
    );
  }

  console.log('SUCCESS: Terminal maintained focus.');

  // Cleanup
  terminal.dispose();
}

/* eslint-disable import/no-default-export */
export default runTest;
