/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { detectIde, IDE_DEFINITIONS } from './detect-ide.js';

beforeEach(() => {
  // Ensure Antigravity detection doesn't interfere with other tests
  vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', '');
});

describe('detectIde', () => {
  beforeEach(() => {
    // Ensure these env vars don't leak from the host environment
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', '');
    vi.stubEnv('TERM_PROGRAM', '');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    vi.stubEnv('CODESPACES', '');
    vi.stubEnv('VSCODE_IPC_HOOK_CLI', '');
    vi.stubEnv('EDITOR_IN_CLOUD_SHELL', '');
    vi.stubEnv('CLOUD_SHELL', '');
    vi.stubEnv('TERM_PRODUCT', '');
    vi.stubEnv('MONOSPACE_ENV', '');
    vi.stubEnv('REPLIT_USER', '');
    vi.stubEnv('__COG_BASHRC_SOURCED', '');
    vi.stubEnv('TERMINAL_EMULATOR', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    // Clear Cursor-specific environment variables that might interfere with tests
    delete process.env['CURSOR_TRACE_ID'];
  });

  it('should return undefined if TERM_PROGRAM is not vscode', () => {
    vi.stubEnv('TERM_PROGRAM', '');
    expect(detectIde()).toBeUndefined();
  });

  it('should detect Devin', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('__COG_BASHRC_SOURCED', '1');
    expect(detectIde()).toBe(IDE_DEFINITIONS.devin);
  });

  it('should detect Replit', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('REPLIT_USER', 'testuser');
    expect(detectIde()).toBe(IDE_DEFINITIONS.replit);
  });

  it('should detect Cursor', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CURSOR_TRACE_ID', 'some-id');
    expect(detectIde()).toBe(IDE_DEFINITIONS.cursor);
  });

  it('should detect Codespaces', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CODESPACES', 'true');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    expect(detectIde()).toBe(IDE_DEFINITIONS.codespaces);
  });

  it('should detect Cloud Shell via EDITOR_IN_CLOUD_SHELL', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('EDITOR_IN_CLOUD_SHELL', 'true');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    expect(detectIde()).toBe(IDE_DEFINITIONS.cloudshell);
  });

  it('should detect Cloud Shell via CLOUD_SHELL', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CLOUD_SHELL', 'true');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    expect(detectIde()).toBe(IDE_DEFINITIONS.cloudshell);
  });

  it('should detect Trae', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('TERM_PRODUCT', 'Trae');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    expect(detectIde()).toBe(IDE_DEFINITIONS.trae);
  });

  it('should detect Firebase Studio via MONOSPACE_ENV', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('MONOSPACE_ENV', 'true');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    expect(detectIde()).toBe(IDE_DEFINITIONS.firebasestudio);
  });

  it('should detect AntiGravity', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', 'agy');
    expect(detectIde()).toBe(IDE_DEFINITIONS.antigravity);
  });

  it('should detect Sublime Text', () => {
    vi.stubEnv('TERM_PROGRAM', 'sublime');
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', '');
    expect(detectIde()).toBe(IDE_DEFINITIONS.sublimetext);
  });

  it('should prioritize Antigravity over Sublime Text', () => {
    vi.stubEnv('TERM_PROGRAM', 'sublime');
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', 'agy');
    expect(detectIde()).toBe(IDE_DEFINITIONS.antigravity);
  });

  it('should detect JetBrains IDE via TERMINAL_EMULATOR', () => {
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');
    expect(detectIde()).toBe(IDE_DEFINITIONS.jetbrains);
  });

  it('should prioritize JetBrains detection over VS Code when TERMINAL_EMULATOR is set', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');
    expect(detectIde()).toBe(IDE_DEFINITIONS.jetbrains);
  });
});

describe('detectIde with ideInfoFromFile', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', '');
    vi.stubEnv('TERM_PROGRAM', '');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    vi.stubEnv('CODESPACES', '');
    vi.stubEnv('VSCODE_IPC_HOOK_CLI', '');
    vi.stubEnv('EDITOR_IN_CLOUD_SHELL', '');
    vi.stubEnv('CLOUD_SHELL', '');
    vi.stubEnv('TERM_PRODUCT', '');
    vi.stubEnv('MONOSPACE_ENV', '');
    vi.stubEnv('REPLIT_USER', '');
    vi.stubEnv('__COG_BASHRC_SOURCED', '');
    vi.stubEnv('TERMINAL_EMULATOR', '');
  });

  it('should use the name and displayName from the file', () => {
    const ideInfoFromFile = {
      name: 'custom-ide',
      displayName: 'Custom IDE',
    };
    expect(detectIde(ideInfoFromFile)).toEqual(ideInfoFromFile);
  });

  it('should fall back to env detection if name is missing', () => {
    const ideInfoFromFile = { displayName: 'Custom IDE' };
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    expect(detectIde(ideInfoFromFile)).toBe(IDE_DEFINITIONS.vscode);
  });

  it('should fall back to env detection if displayName is missing', () => {
    const ideInfoFromFile = { name: 'custom-ide' };
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    expect(detectIde(ideInfoFromFile)).toBe(IDE_DEFINITIONS.vscode);
  });
});
