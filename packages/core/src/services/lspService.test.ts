/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { LspService } from './lspService.js';
import { spawnAsync } from '../utils/shell-utils.js';
import type { Config } from '../config/config.js';
import * as path from 'node:path';

vi.mock('../utils/shell-utils.js', () => ({
  spawnAsync: vi.fn(),
}));

describe('LspService', () => {
  let lspService: LspService;
  let mockConfig: {
    getProjectRoot: Mock;
    getLspSettings: Mock;
  };
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      getProjectRoot: vi.fn().mockReturnValue(projectRoot),
      getLspSettings: vi.fn().mockReturnValue({
        lintEnabled: true,
        lintCommand: 'eslint',
        typeCheckEnabled: true,
        typeCheckCommand: 'tsc',
      }),
    };
    lspService = new LspService(mockConfig as unknown as Config);
  });

  it('should parse TSC error format', async () => {
    const tscOutput = `file.ts(10,5): error TS1234: Property 'x' does not exist on type 'Y'.`;
    (spawnAsync as Mock).mockImplementation((cmd: string) => {
      if (cmd === 'tsc')
        return Promise.resolve({ stdout: tscOutput, stderr: '' });
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    // Mock eslint to return nothing
    (spawnAsync as Mock).mockResolvedValueOnce({ stdout: '', stderr: '' });

    const diagnostics = await lspService.getDiagnostics('file.ts');

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      line: 10,
      column: 5,
      severity: 'error',
      code: 'TS1234',
      message: "Property 'x' does not exist on type 'Y'.",
    });
  });

  it('should parse ESLint error format', async () => {
    const eslintOutput = `file.ts:5:10: error 'foo' is defined but never used.`;
    (spawnAsync as Mock).mockImplementation((cmd: string) => {
      if (cmd === 'eslint')
        return Promise.resolve({ stdout: eslintOutput, stderr: '' });
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    const diagnostics = await lspService.getDiagnostics('file.ts');

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      line: 5,
      column: 10,
      severity: 'error',
      message: "'foo' is defined but never used.",
    });
  });

  it('should parse ESLint stylish (multiline) format', async () => {
    const stylishOutput = `
/test/project/file.ts
  5:10  error  'foo' is defined but never used  no-unused-vars
  10:2  warn   Missing semicolon                semi

/test/project/other.ts
  1:1   error  Extreme error                    fatal
`;
    (spawnAsync as Mock).mockResolvedValue({
      stdout: stylishOutput,
      stderr: '',
    });

    const diagnostics = await lspService.getDiagnostics('file.ts');

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toMatchObject({
      line: 5,
      column: 10,
      severity: 'error',
      message: "'foo' is defined but never used  no-unused-vars",
    });
    expect(diagnostics[1]).toMatchObject({
      line: 10,
      column: 2,
      severity: 'warning',
      message: 'Missing semicolon                semi',
    });
  });

  it('should handle absolute paths in output', async () => {
    const absolutePath = path.resolve(projectRoot, 'src/main.ts');
    const output = `${absolutePath}:1:1: error Some error`;
    (spawnAsync as Mock).mockResolvedValue({ stdout: output, stderr: '' });

    const diagnostics = await lspService.getDiagnostics('src/main.ts');

    expect(diagnostics).toHaveLength(1); // Deduplicated
    expect(diagnostics[0].file).toBe(absolutePath);
  });

  it('should return empty array if both linting and type checking are disabled', async () => {
    mockConfig.getLspSettings.mockReturnValue({
      lintEnabled: false,
      typeCheckEnabled: false,
    });
    const diagnostics = await lspService.getDiagnostics('file.ts');
    expect(diagnostics).toHaveLength(0);
    expect(spawnAsync).not.toHaveBeenCalled();
  });
});
