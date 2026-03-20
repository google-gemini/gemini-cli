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
        lintCommand: 'eslint {file}',
        typeCheckEnabled: true,
        typeCheckCommand: 'tsc --noEmit {file}',
        maxDiagnostics: 5,
      }),
    };
    lspService = new LspService(mockConfig as unknown as Config);
  });

  it('should parse TSC error format', async () => {
    const tscOutput = `file.ts(10,5): error TS1234: Property 'x' does not exist on type 'Y'.`;
    (spawnAsync as Mock).mockImplementation((cmd: string) => {
      if (cmd.includes('tsc'))
        return Promise.resolve({ stdout: tscOutput, stderr: '' });
      return Promise.resolve({ stdout: '', stderr: '' });
    });

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

  it('should parse modern TSC error format', async () => {
    const tscOutput = `file.ts:10:5 - error TS1234: Property 'x' does not exist on type 'Y'.`;
    (spawnAsync as Mock).mockImplementation((cmd: string) => {
      if (cmd.includes('tsc'))
        return Promise.resolve({ stdout: tscOutput, stderr: '' });
      return Promise.resolve({ stdout: '', stderr: '' });
    });

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

  it('should strip --project flag for single file type checks', async () => {
    mockConfig.getLspSettings.mockReturnValue({
      lintEnabled: false,
      typeCheckEnabled: true,
      typeCheckCommand: 'tsc --project tsconfig.json --noEmit',
    });

    (spawnAsync as Mock).mockResolvedValue({ stdout: '', stderr: '' });

    await lspService.getDiagnostics('file.ts');

    const lastCall = (spawnAsync as Mock).mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    expect(lastCall![0]).not.toContain('--project');
    expect(lastCall![0]).not.toContain('tsconfig.json');
    expect(lastCall![1]).toContain('file.ts');
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

  it('should cap diagnostics to maxDiagnostics', async () => {
    const output = `
file.ts:1:1: error 1
file.ts:2:1: error 2
file.ts:3:1: error 3
file.ts:4:1: error 4
file.ts:5:1: error 5
file.ts:6:1: error 6
`;
    (spawnAsync as Mock).mockResolvedValue({ stdout: output, stderr: '' });

    const diagnostics = await lspService.getDiagnostics('file.ts');

    expect(diagnostics).toHaveLength(5); // Capped at 5 from mockConfig
    expect(diagnostics[0].message).toBe('1');
    expect(diagnostics[4].message).toBe('5');
  });

  it('should capture diagnostics from all files during project-wide check', async () => {
    const stylishOutput = `
/test/project/file1.ts
  10:5  error  Error in file 1  rule-1

/test/project/file2.ts
  20:10  warning  Warning in file 2  rule-2
`;
    (spawnAsync as Mock).mockResolvedValue({
      stdout: stylishOutput,
      stderr: '',
    });

    const results = await lspService.runDiagnosticsForProject({
      lint: true,
      types: false,
    });

    expect(results.lint).toHaveLength(2);
    expect(results.lint[0]).toMatchObject({
      file: path.resolve(projectRoot, 'file1.ts'),
      line: 10,
      message: 'Error in file 1  rule-1',
    });
    expect(results.lint[1]).toMatchObject({
      file: path.resolve(projectRoot, 'file2.ts'),
      line: 20,
      message: 'Warning in file 2  rule-2',
    });
  });
});
