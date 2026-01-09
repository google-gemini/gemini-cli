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
  const ideProcessInfo = { pid: 123, command: 'some/path/to/code' };
  const ideProcessInfoNoCode = { pid: 123, command: 'some/path/to/fork' };

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
    expect(detectIde(ideProcessInfo)).toBeUndefined();
  });

  it('should detect Devin', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('__COG_BASHRC_SOURCED', '1');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.devin);
  });

  it('should detect Replit', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('REPLIT_USER', 'testuser');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.replit);
  });

  it('should detect Cursor', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CURSOR_TRACE_ID', 'some-id');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.cursor);
  });

  it('should detect Codespaces', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CODESPACES', 'true');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.codespaces);
  });

  it('should detect Cloud Shell via EDITOR_IN_CLOUD_SHELL', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('EDITOR_IN_CLOUD_SHELL', 'true');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.cloudshell);
  });

  it('should detect Cloud Shell via CLOUD_SHELL', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CLOUD_SHELL', 'true');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.cloudshell);
  });

  it('should detect Trae', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('TERM_PRODUCT', 'Trae');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.trae);
  });

  it('should detect Firebase Studio via MONOSPACE_ENV', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('MONOSPACE_ENV', 'true');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.firebasestudio);
  });

  it('should detect VSCode when no other IDE is detected and command includes "code"', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('MONOSPACE_ENV', '');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.vscode);
  });

  it('should detect VSCodeFork when no other IDE is detected and command does not include "code"', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('MONOSPACE_ENV', '');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    expect(detectIde(ideProcessInfoNoCode)).toBe(IDE_DEFINITIONS.vscodefork);
  });

  it('should detect AntiGravity', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', 'agy');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.antigravity);
  });

  it('should detect Sublime Text', () => {
    vi.stubEnv('TERM_PROGRAM', 'sublime');
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', '');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.sublimetext);
  });

  it('should prioritize Antigravity over Sublime Text', () => {
    vi.stubEnv('TERM_PROGRAM', 'sublime');
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', 'agy');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.antigravity);
  });

  it('should detect JetBrains IDE via TERMINAL_EMULATOR', () => {
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.jetbrains);
  });

  it('should detect IntelliJ IDEA via command', () => {
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');
    const intellijProcessInfo = {
      pid: 123,
      command: '/Applications/IntelliJ IDEA.app',
    };
    expect(detectIde(intellijProcessInfo)).toBe(IDE_DEFINITIONS.intellijidea);
  });

  it('should detect WebStorm via command', () => {
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');
    const webstormProcessInfo = {
      pid: 123,
      command: '/Applications/WebStorm.app',
    };
    expect(detectIde(webstormProcessInfo)).toBe(IDE_DEFINITIONS.webstorm);
  });

  it('should detect PyCharm via command', () => {
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');
    const pycharmProcessInfo = {
      pid: 123,
      command: '/Applications/PyCharm.app',
    };
    expect(detectIde(pycharmProcessInfo)).toBe(IDE_DEFINITIONS.pycharm);
  });

  it('should detect GoLand via command', () => {
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');
    const golandProcessInfo = { pid: 123, command: '/Applications/GoLand.app' };
    expect(detectIde(golandProcessInfo)).toBe(IDE_DEFINITIONS.goland);
  });

  it('should detect Android Studio via command', () => {
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');
    const androidStudioProcessInfo = {
      pid: 123,
      command: '/Applications/Android Studio.app',
    };
    expect(detectIde(androidStudioProcessInfo)).toBe(
      IDE_DEFINITIONS.androidstudio,
    );
  });

  it('should detect CLion via command', () => {
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');
    const clionProcessInfo = { pid: 123, command: '/Applications/CLion.app' };
    expect(detectIde(clionProcessInfo)).toBe(IDE_DEFINITIONS.clion);
  });

  it('should detect RustRover via command', () => {
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');
    const rustroverProcessInfo = {
      pid: 123,
      command: '/Applications/RustRover.app',
    };
    expect(detectIde(rustroverProcessInfo)).toBe(IDE_DEFINITIONS.rustrover);
  });

  it('should detect DataGrip via command', () => {
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');
    const datagripProcessInfo = {
      pid: 123,
      command: '/Applications/DataGrip.app',
    };
    expect(detectIde(datagripProcessInfo)).toBe(IDE_DEFINITIONS.datagrip);
  });

  it('should detect PhpStorm via command', () => {
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');
    const phpstormProcessInfo = {
      pid: 123,
      command: '/Applications/PhpStorm.app',
    };
    expect(detectIde(phpstormProcessInfo)).toBe(IDE_DEFINITIONS.phpstorm);
  });

  it('should return generic JetBrains when command does not match specific IDE', () => {
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');
    const genericProcessInfo = {
      pid: 123,
      command: '/Applications/SomeJetBrainsApp.app',
    };
    expect(detectIde(genericProcessInfo)).toBe(IDE_DEFINITIONS.jetbrains);
  });

  it('should prioritize JetBrains detection over VS Code when TERMINAL_EMULATOR is set', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');
    expect(detectIde(ideProcessInfo)).toBe(IDE_DEFINITIONS.jetbrains);
  });
});

describe('detectIde with ideInfoFromFile', () => {
  const ideProcessInfo = { pid: 123, command: 'some/path/to/code' };

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
    expect(detectIde(ideProcessInfo, ideInfoFromFile)).toEqual(ideInfoFromFile);
  });

  it('should fall back to env detection if name is missing', () => {
    const ideInfoFromFile = { displayName: 'Custom IDE' };
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    expect(detectIde(ideProcessInfo, ideInfoFromFile)).toBe(
      IDE_DEFINITIONS.vscode,
    );
  });

  it('should fall back to env detection if displayName is missing', () => {
    const ideInfoFromFile = { name: 'custom-ide' };
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    expect(detectIde(ideProcessInfo, ideInfoFromFile)).toBe(
      IDE_DEFINITIONS.vscode,
    );
  });
});
