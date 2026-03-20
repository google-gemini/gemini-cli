/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLspDiagnosticsHook } from './lspDiagnostics.js';

vi.mock('node:timers/promises', () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));
import {
  HookEventName,
  type AfterToolInput,
  type HookInput,
  type HookOutput,
} from './types.js';
import {
  EDIT_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
} from '../tools/definitions/coreTools.js';
import type { LspService } from '../services/lspService.js';
import type { Diagnostic } from '../services/lspTypes.js';

describe('lspDiagnosticsHook', () => {
  const mockConfig = {
    getLspSettings: vi.fn().mockReturnValue({
      debounceDelay: 0,
    }),
    isTrustedFolder: vi.fn().mockReturnValue(true),
  };

  const mockLspService = {
    getDiagnostics: vi.fn(),
    invalidateCache: vi.fn(),
    getConfig: vi.fn().mockReturnValue(mockConfig),
  } as unknown as LspService;

  const hook = createLspDiagnosticsHook(mockLspService);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockConfig.isTrustedFolder).mockReturnValue(true);
  });

  const baseInput: HookInput = {
    session_id: 'test-session',
    transcript_path: 'test-transcript.jsonl',
    cwd: '/test/cwd',
    timestamp: new Date().toISOString(),
    hook_event_name: HookEventName.AfterTool,
  };

  it('should skip if the folder is not trusted', async () => {
    vi.mocked(mockConfig.isTrustedFolder).mockReturnValue(false);

    const input: AfterToolInput = {
      ...baseInput,
      tool_name: EDIT_TOOL_NAME,
      tool_input: { file_path: 'test.ts' },
      tool_response: { success: true },
    };

    const result = (await hook.action(input)) as HookOutput;

    expect(mockLspService.getDiagnostics).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('should trigger for file modification tools', async () => {
    const diagnostics: Diagnostic[] = [
      {
        file: 'test.ts',
        line: 1,
        column: 1,
        severity: 'error',
        message: 'Error message',
      },
    ];
    vi.mocked(mockLspService.getDiagnostics).mockResolvedValue(diagnostics);

    const input: AfterToolInput = {
      ...baseInput,
      tool_name: EDIT_TOOL_NAME,
      tool_input: { file_path: 'test.ts' },
      tool_response: { success: true },
    };

    const result = (await hook.action(input)) as HookOutput;

    expect(mockLspService.getDiagnostics).toHaveBeenCalledWith('test.ts');
    expect(result).toBeDefined();
    expect(result?.hookSpecificOutput?.['diagnostics']).toContain(
      'Error message',
    );
  });

  it('should trigger for discovered tools', async () => {
    vi.mocked(mockLspService.getDiagnostics).mockResolvedValue([
      {
        file: 'test.ts',
        line: 1,
        column: 1,
        severity: 'error',
        message: 'Error message',
      },
    ]);

    const input: AfterToolInput = {
      ...baseInput,
      tool_name: 'discovered_tool_abc',
      tool_input: { file_path: 'test.ts' },
      tool_response: { success: true },
    };

    const result = (await hook.action(input)) as HookOutput;

    expect(mockLspService.getDiagnostics).toHaveBeenCalledWith('test.ts');
    expect(result).toBeDefined();
  });

  it('should skip if the tool is not a file modification tool', async () => {
    const input: AfterToolInput = {
      ...baseInput,
      tool_name: 'not_a_file_tool',
      tool_input: { some_param: 'value' },
      tool_response: { success: true },
    };

    const result = (await hook.action(input)) as HookOutput;

    expect(mockLspService.getDiagnostics).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('should skip if the tool failed', async () => {
    const input: AfterToolInput = {
      ...baseInput,
      tool_name: EDIT_TOOL_NAME,
      tool_input: { file_path: 'test.ts' },
      tool_response: { error: 'Failed' },
    };

    const result = (await hook.action(input)) as HookOutput;

    expect(mockLspService.getDiagnostics).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('should skip if file_path is missing in tool input', async () => {
    const input: AfterToolInput = {
      ...baseInput,
      tool_name: EDIT_TOOL_NAME,
      tool_input: { some_other_param: 'value' },
      tool_response: { success: true },
    };

    const result = (await hook.action(input)) as HookOutput;

    expect(mockLspService.getDiagnostics).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('should return undefined if no diagnostics are found', async () => {
    vi.mocked(mockLspService.getDiagnostics).mockResolvedValue([]);

    const input: AfterToolInput = {
      ...baseInput,
      tool_name: WRITE_FILE_TOOL_NAME,
      tool_input: { file_path: 'test.ts' },
      tool_response: { success: true },
    };

    const result = (await hook.action(input)) as HookOutput;

    expect(result).toBeUndefined();
  });

  it('should improve readability of linter regexes in messages', async () => {
    vi.mocked(mockLspService.getDiagnostics).mockResolvedValue([
      {
        file: 'test.ts',
        line: 5,
        column: 10,
        severity: 'warning',
        message: 'Variable should match /^[a-z]+$/u',
      },
    ]);

    const input: AfterToolInput = {
      ...baseInput,
      tool_name: EDIT_TOOL_NAME,
      tool_input: { file_path: 'test.ts' },
      tool_response: { success: true },
    };

    const result = (await hook.action(input)) as HookOutput;

    expect(result?.hookSpecificOutput?.['diagnostics']).toContain(
      'Variable should match ^[a-z]+$',
    );
  });

  it('should handle multiple diagnostics across multiple lines', async () => {
    vi.mocked(mockLspService.getDiagnostics).mockResolvedValue([
      {
        file: 'test.ts',
        line: 1,
        column: 1,
        severity: 'error',
        message: 'Error 1',
      },
      {
        file: 'test.ts',
        line: 10,
        column: 5,
        severity: 'warning',
        message: 'Warning 2',
      },
    ]);

    const input: AfterToolInput = {
      ...baseInput,
      tool_name: EDIT_TOOL_NAME,
      tool_input: { file_path: 'test.ts' },
      tool_response: { success: true },
    };

    const result = (await hook.action(input)) as HookOutput;

    expect(result?.hookSpecificOutput?.['diagnostics']).toContain(
      '- [ERROR] Line 1, Col 1: Error 1',
    );
    expect(result?.hookSpecificOutput?.['diagnostics']).toContain(
      '- [WARNING] Line 10, Col 5: Warning 2',
    );
    expect(result?.hookSpecificOutput?.['additionalContext']).toContain(
      'Error 1',
    );
    expect(result?.hookSpecificOutput?.['additionalContext']).toContain(
      'Warning 2',
    );
  });

  it('should handle different severities correctly', async () => {
    vi.mocked(mockLspService.getDiagnostics).mockResolvedValue([
      {
        file: 'test.ts',
        line: 1,
        column: 1,
        severity: 'info',
        message: 'Some info message',
      },
    ]);

    const input: AfterToolInput = {
      ...baseInput,
      tool_name: EDIT_TOOL_NAME,
      tool_input: { file_path: 'test.ts' },
      tool_response: { success: true },
    };

    const result = (await hook.action(input)) as HookOutput;

    expect(result?.hookSpecificOutput?.['diagnostics']).toContain(
      '- [INFO] Line 1, Col 1: Some info message',
    );
  });

  it('should skip gracefully if the lspService throws', async () => {
    vi.mocked(mockLspService.getDiagnostics).mockRejectedValue(
      new Error('LSP failure'),
    );

    const input: AfterToolInput = {
      ...baseInput,
      tool_name: EDIT_TOOL_NAME,
      tool_input: { file_path: 'test.ts' },
      tool_response: { success: true },
    };

    // We don't want the hook to crash the main execution loop
    const result = (await hook.action(input)) as HookOutput;
    expect(result).toBeUndefined();
  });
});
