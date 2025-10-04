/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectIde, IDE_DEFINITIONS } from './detect-ide.js';

describe('detectIde', () => {
  const ideProcessInfo = { pid: 123, command: 'some/path/to/code' };
  const ideProcessInfoNoCode = { pid: 123, command: 'some/path/to/fork' };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return undefined if TERM_PROGRAM is not vscode', () => {
    vi.stubEnv('TERM_PROGRAM', '');
    vi.stubEnv('TERMINAL_EMULATOR', '');
    expect(detectIde(ideProcessInfo)).toBeUndefined();
  });

  it('should detect Devin', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('__COG_BASHRC_SOURCED', '1');
    vi.stubEnv('TERMINAL_EMULATOR', '');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.devin);
  });

  it('should detect Replit', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('REPLIT_USER', 'testuser');
    vi.stubEnv('TERMINAL_EMULATOR', '');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.replit);
  });

  it('should detect Cursor', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CURSOR_TRACE_ID', 'some-id');
    vi.stubEnv('TERMINAL_EMULATOR', '');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.cursor);
  });

  it('should detect Codespaces', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CODESPACES', 'true');
    vi.stubEnv('TERMINAL_EMULATOR', '');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.codespaces);
  });

  it('should detect Cloud Shell via EDITOR_IN_CLOUD_SHELL', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('EDITOR_IN_CLOUD_SHELL', 'true');
    vi.stubEnv('TERMINAL_EMULATOR', '');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.cloudshell);
  });

  it('should detect Cloud Shell via CLOUD_SHELL', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CLOUD_SHELL', 'true');
    vi.stubEnv('TERMINAL_EMULATOR', '');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.cloudshell);
  });

  it('should detect Trae', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('TERM_PRODUCT', 'Trae');
    vi.stubEnv('TERMINAL_EMULATOR', '');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.trae);
  });

  it('should detect Firebase Studio via MONOSPACE_ENV', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('MONOSPACE_ENV', 'true');
    vi.stubEnv('TERMINAL_EMULATOR', '');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.firebasestudio);
  });

  it('should detect VSCode when no other IDE is detected and command includes "code"', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('MONOSPACE_ENV', '');
    vi.stubEnv('TERMINAL_EMULATOR', '');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.vscode);
  });

  it('should detect VSCodeFork when no other IDE is detected and command does not include "code"', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('MONOSPACE_ENV', '');
    vi.stubEnv('TERMINAL_EMULATOR', '');
    expect(detectIde(ideProcessInfoNoCode)).toBe(IDE_DEFINITIONS.vscodefork);
  });

  it('should detect JetBrains IDE', () => {
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-WebStorm');
    const result = detectIde(ideProcessInfo);
    console.log('Detected IDE:', result);
    expect(result).toBe(IDE_DEFINITIONS.jetbrains);
  });

  it('should detect CLion from process command', () => {
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-CLion');
    const clionProcessInfo = { pid: 123, command: 'some/path/to/clion' };
    const result = detectIde(clionProcessInfo);
    expect(result).toBe(IDE_DEFINITIONS.clion);
  });

  it('should detect RustRover from process command', () => {
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-RustRover');
    const rustRoverProcessInfo = {
      pid: 123,
      command: 'some/path/to/rustrover',
    };
    const result = detectIde(rustRoverProcessInfo);
    expect(result).toBe(IDE_DEFINITIONS.rustrover);
  });

  it('should detect DataGrip from process command', () => {
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-DataGrip');
    const dataGripProcessInfo = { pid: 123, command: 'some/path/to/datagrip' };
    const result = detectIde(dataGripProcessInfo);
    expect(result).toBe(IDE_DEFINITIONS.datagrip);
  });
});

describe('detectIde with ideInfoFromFile', () => {
  const ideProcessInfo = { pid: 123, command: 'some/path/to/code' };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should use the name and displayName from the file', () => {
    const ideInfoFromFile = {
      name: 'custom-ide',
      displayName: 'Custom IDE',
    };
    expect(detectIde(ideProcessInfo, ideInfoFromFile)).toEqual(ideInfoFromFile);
  });

  it('should fall back to env detection if name is missing', () => {
    const ideInfoFromFile = { displayName: 'Custom IDE' };
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('TERMINAL_EMULATOR', '');
    expect(detectIde(ideProcessInfo, ideInfoFromFile)).toBe(
      IDE_DEFINITIONS.vscode,
    );
  });

  it('should fall back to env detection if displayName is missing', () => {
    const ideInfoFromFile = { name: 'custom-ide' };
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('TERMINAL_EMULATOR', '');
    expect(detectIde(ideProcessInfo, ideInfoFromFile)).toBe(
      IDE_DEFINITIONS.vscode,
    );
  });
});
