/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectIde, DetectedIde, getIdeInfo } from './detect-ide.js';

describe('detectIde', () => {
  const ideProcessInfo = { pid: 123, command: 'some/path/to/code' };
  const ideProcessInfoNoCode = { pid: 123, command: 'some/path/to/fork' };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return undefined if TERM_PROGRAM is not vscode', () => {
    vi.stubEnv('TERM_PROGRAM', '');
    expect(detectIde(ideProcessInfo)).toBeUndefined();
  });

  it('should detect Devin', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('__COG_BASHRC_SOURCED', '1');
    expect(detectIde(ideProcessInfo)).toBe(DetectedIde.Devin);
  });

  it('should detect Replit', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('REPLIT_USER', 'testuser');
    expect(detectIde(ideProcessInfo)).toBe(DetectedIde.Replit);
  });

  it('should detect Cursor', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CURSOR_TRACE_ID', 'some-id');
    expect(detectIde(ideProcessInfo)).toBe(DetectedIde.Cursor);
  });

  it('should detect Codespaces', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CODESPACES', 'true');
    expect(detectIde(ideProcessInfo)).toBe(DetectedIde.Codespaces);
  });

  it('should detect Cloud Shell via EDITOR_IN_CLOUD_SHELL', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('EDITOR_IN_CLOUD_SHELL', 'true');
    expect(detectIde(ideProcessInfo)).toBe(DetectedIde.CloudShell);
  });

  it('should detect Cloud Shell via CLOUD_SHELL', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CLOUD_SHELL', 'true');
    expect(detectIde(ideProcessInfo)).toBe(DetectedIde.CloudShell);
  });

  it('should detect Trae', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('TERM_PRODUCT', 'Trae');
    expect(detectIde(ideProcessInfo)).toBe(DetectedIde.Trae);
  });

  it('should detect Firebase Studio via MONOSPACE_ENV', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('MONOSPACE_ENV', 'true');
    expect(detectIde(ideProcessInfo)).toBe(DetectedIde.FirebaseStudio);
  });

  it('should detect VSCode when no other IDE is detected and command includes "code"', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('MONOSPACE_ENV', '');
    expect(detectIde(ideProcessInfo)).toBe(DetectedIde.VSCode);
  });

  it('should detect VSCodeFork when no other IDE is detected and command does not include "code"', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('MONOSPACE_ENV', '');
    expect(detectIde(ideProcessInfoNoCode)).toBe(DetectedIde.VSCodeFork);
  });

  it('should prioritize other IDEs over VSCode detection', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('REPLIT_USER', 'testuser');
    expect(detectIde(ideProcessInfo)).toBe(DetectedIde.Replit);
  });
});

describe('getIdeInfo', () => {
  it('should return correct info for Devin', () => {
    expect(getIdeInfo(DetectedIde.Devin)).toEqual({ displayName: 'Devin' });
  });

  it('should return correct info for Replit', () => {
    expect(getIdeInfo(DetectedIde.Replit)).toEqual({ displayName: 'Replit' });
  });

  it('should return correct info for Cursor', () => {
    expect(getIdeInfo(DetectedIde.Cursor)).toEqual({ displayName: 'Cursor' });
  });

  it('should return correct info for CloudShell', () => {
    expect(getIdeInfo(DetectedIde.CloudShell)).toEqual({
      displayName: 'Cloud Shell',
    });
  });

  it('should return correct info for Codespaces', () => {
    expect(getIdeInfo(DetectedIde.Codespaces)).toEqual({
      displayName: 'GitHub Codespaces',
    });
  });

  it('should return correct info for FirebaseStudio', () => {
    expect(getIdeInfo(DetectedIde.FirebaseStudio)).toEqual({
      displayName: 'Firebase Studio',
    });
  });

  it('should return correct info for Trae', () => {
    expect(getIdeInfo(DetectedIde.Trae)).toEqual({ displayName: 'Trae' });
  });

  it('should return correct info for VSCode', () => {
    expect(getIdeInfo(DetectedIde.VSCode)).toEqual({ displayName: 'VS Code' });
  });

  it('should return correct info for VSCodeFork', () => {
    expect(getIdeInfo(DetectedIde.VSCodeFork)).toEqual({ displayName: 'IDE' });
  });
});
