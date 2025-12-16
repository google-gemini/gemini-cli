/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  lspManager,
  formatDiagnostics,
  collectDiagnosticsForOutput,
  SEVERITY_NAMES,
} from './index.js';
import type { Diagnostic } from './types.js';

// Mock the server module to avoid spawning real LSP servers
vi.mock('./server.js', () => ({
  ALL_SERVERS: [],
  getServerById: vi.fn(),
  getServersForExtension: vi.fn(() => []),
}));

describe('LSP Manager', () => {
  beforeEach(async () => {
    await lspManager.shutdown();
  });

  afterEach(async () => {
    await lspManager.shutdown();
  });

  describe('init and isEnabled', () => {
    it('should initialize enabled by default', async () => {
      await lspManager.init();
      expect(lspManager.isEnabled()).toBe(true);
    });

    it('should initialize as disabled when configured', async () => {
      await lspManager.init({ enabled: false });
      expect(lspManager.isEnabled()).toBe(false);
    });

    it('should retain enabled state after shutdown', async () => {
      await lspManager.init();
      await lspManager.shutdown();
      expect(lspManager.isEnabled()).toBe(true);
    });
  });

  describe('file operations when disabled', () => {
    beforeEach(async () => {
      await lspManager.init({ enabled: false });
    });

    it('should handle touchFile gracefully', async () => {
      await expect(
        lspManager.touchFile('/path/to/file.ts'),
      ).resolves.not.toThrow();
    });

    it('should handle touchFileWithContent gracefully', async () => {
      await expect(
        lspManager.touchFileWithContent('/path/to/file.ts', 'content'),
      ).resolves.not.toThrow();
    });

    it('should return empty diagnostics', async () => {
      const diagnostics = await lspManager.getDiagnostics('/path/to/file.ts');
      expect(diagnostics).toEqual([]);
    });

    it('should return null for hover', async () => {
      const hover = await lspManager.getHover('/path/to/file.ts', 0, 0);
      expect(hover).toBeNull();
    });

    it('should return null for hoverContent', async () => {
      const content = await lspManager.getHoverContent(
        '/path/to/file.ts',
        0,
        0,
      );
      expect(content).toBeNull();
    });
  });

  describe('file operations with no servers', () => {
    beforeEach(async () => {
      await lspManager.init();
    });

    it('should handle unsupported file types gracefully', async () => {
      await expect(
        lspManager.touchFile('/path/to/file.py'),
      ).resolves.not.toThrow();
      await expect(
        lspManager.touchFileWithContent('/path/to/file.py', 'content'),
      ).resolves.not.toThrow();
    });

    it('should return empty results when no servers available', async () => {
      const diagnostics = await lspManager.getDiagnostics('/path/to/file.ts');
      const hover = await lspManager.getHover('/path/to/file.ts', 0, 0);
      expect(diagnostics).toEqual([]);
      expect(hover).toBeNull();
    });
  });

  describe('shutdown', () => {
    it('should be idempotent', async () => {
      await lspManager.init();
      await expect(lspManager.shutdown()).resolves.not.toThrow();
      await expect(lspManager.shutdown()).resolves.not.toThrow();
    });

    it('should reset active client count to zero', async () => {
      await lspManager.init();
      await lspManager.shutdown();
      expect(lspManager.getActiveClientCount()).toBe(0);
    });
  });
});

describe('formatDiagnostics', () => {
  it('should return "No diagnostics found." for empty array', () => {
    expect(formatDiagnostics([])).toBe('No diagnostics found.');
  });

  it('should format diagnostic with correct 1-indexed position', () => {
    const diagnostics: Diagnostic[] = [
      {
        range: {
          start: { line: 0, character: 5 },
          end: { line: 0, character: 10 },
        },
        message: 'Type error',
        severity: 1,
      },
    ];

    const result = formatDiagnostics(diagnostics);
    expect(result).toContain('ERROR');
    expect(result).toContain('1:6'); // 0-indexed to 1-indexed
    expect(result).toContain('Type error');
  });

  it('should format multiple diagnostics with different severities', () => {
    const diagnostics: Diagnostic[] = [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
        message: 'Error',
        severity: 1,
      },
      {
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 1 },
        },
        message: 'Warning',
        severity: 2,
      },
      {
        range: {
          start: { line: 2, character: 0 },
          end: { line: 2, character: 1 },
        },
        message: 'Info',
        severity: 3,
      },
      {
        range: {
          start: { line: 3, character: 0 },
          end: { line: 3, character: 1 },
        },
        message: 'Hint',
        severity: 4,
      },
    ];

    const result = formatDiagnostics(diagnostics);
    expect(result).toContain('ERROR');
    expect(result).toContain('WARN');
    expect(result).toContain('INFO');
    expect(result).toContain('HINT');
  });

  it('should include file basename when provided', () => {
    const diagnostics: Diagnostic[] = [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        message: 'Error message',
        severity: 1,
      },
    ];

    const result = formatDiagnostics(diagnostics, '/path/to/file.ts');
    expect(result).toContain('file.ts:');
  });

  it('should default to ERROR for undefined severity', () => {
    const diagnostics: Diagnostic[] = [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        message: 'No severity',
      },
    ];

    const result = formatDiagnostics(diagnostics);
    expect(result).toContain('ERROR');
  });
});

describe('SEVERITY_NAMES', () => {
  it('should have correct severity mappings', () => {
    expect(SEVERITY_NAMES[1]).toBe('ERROR');
    expect(SEVERITY_NAMES[2]).toBe('WARN');
    expect(SEVERITY_NAMES[3]).toBe('INFO');
    expect(SEVERITY_NAMES[4]).toBe('HINT');
  });
});

describe('collectDiagnosticsForOutput', () => {
  const mockDiagnostics: Diagnostic[] = [
    {
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 10 },
      },
      message: "Cannot find name 'foo'",
      severity: 1, // ERROR
    },
    {
      range: {
        start: { line: 5, character: 2 },
        end: { line: 5, character: 15 },
      },
      message: 'Unused variable',
      severity: 2, // WARN
    },
    {
      range: {
        start: { line: 10, character: 0 },
        end: { line: 10, character: 5 },
      },
      message: 'Consider using const',
      severity: 3, // INFO
    },
    {
      range: {
        start: { line: 15, character: 0 },
        end: { line: 15, character: 5 },
      },
      message: 'Prefer arrow function',
      severity: 4, // HINT
    },
  ];

  beforeEach(async () => {
    await lspManager.shutdown();
  });

  afterEach(async () => {
    await lspManager.shutdown();
    vi.restoreAllMocks();
  });

  it('should return null when LSP is disabled', async () => {
    await lspManager.init({ enabled: false });

    const result = await collectDiagnosticsForOutput(
      '/path/to/file.ts',
      'const x = 1;',
    );

    expect(result).toBeNull();
  });

  it('should return null when LSP is not initialized', async () => {
    // Don't call init - lspManager should not be enabled
    const result = await collectDiagnosticsForOutput(
      '/path/to/file.ts',
      'const x = 1;',
    );

    expect(result).toBeNull();
  });

  it('should return null when no diagnostics are found', async () => {
    await lspManager.init();

    // Mock getDiagnostics to return empty array
    vi.spyOn(lspManager, 'getDiagnostics').mockResolvedValue([]);
    vi.spyOn(lspManager, 'touchFileWithContent').mockResolvedValue();

    const result = await collectDiagnosticsForOutput(
      '/path/to/file.ts',
      'const x = 1;',
    );

    expect(result).toBeNull();
  });

  it('should return null when only INFO/HINT diagnostics exist (filtered out by default)', async () => {
    await lspManager.init();

    const infoAndHintOnly: Diagnostic[] = [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        message: 'Info message',
        severity: 3,
      },
      {
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 5 },
        },
        message: 'Hint message',
        severity: 4,
      },
    ];

    vi.spyOn(lspManager, 'getDiagnostics').mockResolvedValue(infoAndHintOnly);
    vi.spyOn(lspManager, 'touchFileWithContent').mockResolvedValue();

    const result = await collectDiagnosticsForOutput(
      '/path/to/file.ts',
      'const x = 1;',
    );

    expect(result).toBeNull();
  });

  it('should return formatted <lsp_diagnostics> block when errors exist', async () => {
    await lspManager.init();

    vi.spyOn(lspManager, 'getDiagnostics').mockResolvedValue(mockDiagnostics);
    vi.spyOn(lspManager, 'touchFileWithContent').mockResolvedValue();

    const result = await collectDiagnosticsForOutput(
      '/path/to/file.ts',
      'const x = 1;',
    );

    expect(result).not.toBeNull();
    expect(result).toContain('<lsp_diagnostics>');
    expect(result).toContain('</lsp_diagnostics>');
    expect(result).toContain('Please fix the following errors:');
    expect(result).toContain("Cannot find name 'foo'");
    expect(result).toContain('Unused variable');
    expect(result).toContain('ERROR');
    expect(result).toContain('WARN');
    // INFO and HINT should be filtered out by default
    expect(result).not.toContain('Consider using const');
    expect(result).not.toContain('Prefer arrow function');
  });

  it('should filter diagnostics by severity (default: ERROR + WARN only)', async () => {
    await lspManager.init();

    vi.spyOn(lspManager, 'getDiagnostics').mockResolvedValue(mockDiagnostics);
    vi.spyOn(lspManager, 'touchFileWithContent').mockResolvedValue();

    const result = await collectDiagnosticsForOutput(
      '/path/to/file.ts',
      'const x = 1;',
    );

    expect(result).not.toBeNull();
    // Should include ERROR (1) and WARN (2)
    expect(result).toContain('ERROR');
    expect(result).toContain('WARN');
    // Should NOT include INFO (3) and HINT (4)
    expect(result).not.toContain('INFO');
    expect(result).not.toContain('HINT');
  });

  it('should allow custom severity filter via options', async () => {
    await lspManager.init();

    vi.spyOn(lspManager, 'getDiagnostics').mockResolvedValue(mockDiagnostics);
    vi.spyOn(lspManager, 'touchFileWithContent').mockResolvedValue();

    // Only include INFO (3)
    const result = await collectDiagnosticsForOutput(
      '/path/to/file.ts',
      'const x = 1;',
      { severityFilter: [3] },
    );

    expect(result).not.toBeNull();
    expect(result).toContain('INFO');
    expect(result).toContain('Consider using const');
    expect(result).not.toContain('ERROR');
    expect(result).not.toContain('WARN');
  });

  it('should truncate diagnostics when exceeding maxDiagnostics limit', async () => {
    await lspManager.init();

    // Create 25 error diagnostics
    const manyDiagnostics: Diagnostic[] = Array.from(
      { length: 25 },
      (_, i) => ({
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: 10 },
        },
        message: `Error ${i + 1}`,
        severity: 1,
      }),
    );

    vi.spyOn(lspManager, 'getDiagnostics').mockResolvedValue(manyDiagnostics);
    vi.spyOn(lspManager, 'touchFileWithContent').mockResolvedValue();

    const result = await collectDiagnosticsForOutput(
      '/path/to/file.ts',
      'const x = 1;',
    );

    expect(result).not.toBeNull();
    // Default maxDiagnostics is 20, should show "... and 5 more"
    expect(result).toContain('... and 5 more');
    // Should contain first 20 errors
    expect(result).toContain('Error 1');
    expect(result).toContain('Error 20');
    // Should NOT contain errors beyond limit in the formatted output
    expect(result).not.toContain('Error 21');
  });

  it('should respect custom maxDiagnostics option', async () => {
    await lspManager.init();

    const tenDiagnostics: Diagnostic[] = Array.from({ length: 10 }, (_, i) => ({
      range: {
        start: { line: i, character: 0 },
        end: { line: i, character: 10 },
      },
      message: `Error ${i + 1}`,
      severity: 1,
    }));

    vi.spyOn(lspManager, 'getDiagnostics').mockResolvedValue(tenDiagnostics);
    vi.spyOn(lspManager, 'touchFileWithContent').mockResolvedValue();

    const result = await collectDiagnosticsForOutput(
      '/path/to/file.ts',
      'const x = 1;',
      { maxDiagnostics: 5 },
    );

    expect(result).not.toBeNull();
    expect(result).toContain('... and 5 more');
    expect(result).toContain('Error 1');
    expect(result).toContain('Error 5');
    expect(result).not.toContain('Error 6');
  });

  it('should not show truncation message when diagnostics fit within limit', async () => {
    await lspManager.init();

    const fewDiagnostics: Diagnostic[] = [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
        message: 'Single error',
        severity: 1,
      },
    ];

    vi.spyOn(lspManager, 'getDiagnostics').mockResolvedValue(fewDiagnostics);
    vi.spyOn(lspManager, 'touchFileWithContent').mockResolvedValue();

    const result = await collectDiagnosticsForOutput(
      '/path/to/file.ts',
      'const x = 1;',
    );

    expect(result).not.toBeNull();
    expect(result).not.toContain('... and');
    expect(result).toContain('Single error');
  });

  it('should include file basename in formatted diagnostics', async () => {
    await lspManager.init();

    const diagnostic: Diagnostic[] = [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
        message: 'Test error',
        severity: 1,
      },
    ];

    vi.spyOn(lspManager, 'getDiagnostics').mockResolvedValue(diagnostic);
    vi.spyOn(lspManager, 'touchFileWithContent').mockResolvedValue();

    const result = await collectDiagnosticsForOutput(
      '/some/deep/path/myComponent.tsx',
      'const x = 1;',
    );

    expect(result).not.toBeNull();
    expect(result).toContain('myComponent.tsx:');
  });

  it('should return null when LSP throws an error', async () => {
    await lspManager.init();

    vi.spyOn(lspManager, 'touchFileWithContent').mockRejectedValue(
      new Error('LSP server crashed'),
    );

    const result = await collectDiagnosticsForOutput(
      '/path/to/file.ts',
      'const x = 1;',
    );

    // Should gracefully return null instead of throwing
    expect(result).toBeNull();
  });

  it('should call touchFileWithContent with correct arguments', async () => {
    await lspManager.init();

    const touchSpy = vi
      .spyOn(lspManager, 'touchFileWithContent')
      .mockResolvedValue();
    vi.spyOn(lspManager, 'getDiagnostics').mockResolvedValue([]);

    const filePath = '/path/to/file.ts';
    const content = 'const x: string = 123;';

    await collectDiagnosticsForOutput(filePath, content);

    expect(touchSpy).toHaveBeenCalledWith(filePath, content, undefined);
  });

  it('should handle diagnostics with undefined severity (defaults to ERROR)', async () => {
    await lspManager.init();

    const diagnosticWithoutSeverity: Diagnostic[] = [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
        message: 'Error without explicit severity',
        // severity is undefined
      },
    ];

    vi.spyOn(lspManager, 'getDiagnostics').mockResolvedValue(
      diagnosticWithoutSeverity,
    );
    vi.spyOn(lspManager, 'touchFileWithContent').mockResolvedValue();

    const result = await collectDiagnosticsForOutput(
      '/path/to/file.ts',
      'const x = 1;',
    );

    // Undefined severity defaults to 1 (ERROR), which is in the default filter
    expect(result).not.toBeNull();
    expect(result).toContain('ERROR');
    expect(result).toContain('Error without explicit severity');
  });
});
