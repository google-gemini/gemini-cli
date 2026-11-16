/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockShellConfiguration = vi.hoisted(() => vi.fn());

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  platform: () => 'win32',
}));

vi.mock('../../utils/shell-utils.js', () => ({
  getShellConfiguration: mockShellConfiguration,
}));

import {
  getShellToolDescription,
  getCommandDescription,
  getShellDeclaration,
} from './dynamic-declaration-helpers.js';

describe('Windows shell tool declarations', () => {
  beforeEach(() => {
    mockShellConfiguration.mockReset();
  });

  it('advertises the selected PowerShell 7 executable and real flags', () => {
    mockShellConfiguration.mockReturnValue({
      executable: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      argsPrefix: ['-NoProfile', '-NonInteractive', '-Command'],
      shell: 'powershell',
    });

    const description = getShellToolDescription(true, false);
    expect(description).toContain(
      'pwsh.exe -NoProfile -NonInteractive -Command <command>',
    );
    expect(description).not.toContain('Windows PowerShell 5.1');
    expect(getCommandDescription()).toContain(
      'pwsh.exe -NoProfile -NonInteractive -Command <command>',
    );
  });

  it('identifies the 5.1 quoting limitation in the model-facing description', () => {
    mockShellConfiguration.mockReturnValue({
      executable: 'powershell.exe',
      argsPrefix: ['-NoProfile', '-NonInteractive', '-Command'],
      shell: 'powershell',
    });

    const declaration = getShellDeclaration(false, false);
    expect(declaration.description).toContain(
      'powershell.exe -NoProfile -NonInteractive -Command <command>',
    );
    expect(declaration.description).toContain(String.raw`backslash (\").`);
    expect(getCommandDescription()).toContain(
      'powershell.exe -NoProfile -NonInteractive -Command <command>',
    );
  });
});
