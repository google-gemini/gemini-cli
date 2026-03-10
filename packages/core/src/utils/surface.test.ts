/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { determineSurface, SURFACE_NOT_SET } from './surface.js';

describe('determineSurface', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return GEMINI_CLI_SURFACE when set', () => {
    vi.stubEnv('GEMINI_CLI_SURFACE', 'my-custom-app');
    expect(determineSurface()).toBe('my-custom-app');
  });

  it('should prioritize GEMINI_CLI_SURFACE over SURFACE', () => {
    vi.stubEnv('GEMINI_CLI_SURFACE', 'gca-agent');
    vi.stubEnv('SURFACE', 'ide-1234');
    expect(determineSurface()).toBe('gca-agent');
  });

  it('should prioritize GEMINI_CLI_SURFACE over auto-detection', () => {
    vi.stubEnv('GEMINI_CLI_SURFACE', 'gca-agent');
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    expect(determineSurface()).toBe('gca-agent');
  });

  it('should fall back to SURFACE env var when GEMINI_CLI_SURFACE is not set', () => {
    vi.stubEnv('GEMINI_CLI_SURFACE', '');
    vi.stubEnv('SURFACE', 'ide-1234');
    expect(determineSurface()).toBe('ide-1234');
  });

  it('should detect Cloud Shell via CLOUD_SHELL env var', () => {
    vi.stubEnv('GEMINI_CLI_SURFACE', '');
    vi.stubEnv('SURFACE', '');
    vi.stubEnv('GITHUB_SHA', '');
    vi.stubEnv('CLOUD_SHELL', 'true');
    expect(determineSurface()).toBe('cloudshell');
  });

  it('should detect Cloud Shell via EDITOR_IN_CLOUD_SHELL env var', () => {
    vi.stubEnv('GEMINI_CLI_SURFACE', '');
    vi.stubEnv('SURFACE', '');
    vi.stubEnv('GITHUB_SHA', '');
    vi.stubEnv('EDITOR_IN_CLOUD_SHELL', 'true');
    expect(determineSurface()).toBe('cloudshell');
  });

  it('should detect GitHub Actions via GITHUB_SHA env var', () => {
    vi.stubEnv('GEMINI_CLI_SURFACE', '');
    vi.stubEnv('SURFACE', '');
    vi.stubEnv('GITHUB_SHA', 'abc123');
    expect(determineSurface()).toBe('GitHub');
  });

  it('should detect VSCode via TERM_PROGRAM env var', () => {
    vi.stubEnv('GEMINI_CLI_SURFACE', '');
    vi.stubEnv('SURFACE', '');
    vi.stubEnv('GITHUB_SHA', '');
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    vi.stubEnv('MONOSPACE_ENV', '');
    vi.stubEnv('POSITRON', '');
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', '');
    vi.stubEnv('__COG_BASHRC_SOURCED', '');
    vi.stubEnv('REPLIT_USER', '');
    vi.stubEnv('CODESPACES', '');
    vi.stubEnv('CLOUD_SHELL', '');
    vi.stubEnv('EDITOR_IN_CLOUD_SHELL', '');
    expect(determineSurface()).toBe('vscode');
  });

  it('should detect Cursor when CURSOR_TRACE_ID is set', () => {
    vi.stubEnv('GEMINI_CLI_SURFACE', '');
    vi.stubEnv('SURFACE', '');
    vi.stubEnv('GITHUB_SHA', '');
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CURSOR_TRACE_ID', 'abc123');
    expect(determineSurface()).toBe('cursor');
  });

  it('should detect Replit without TERM_PROGRAM=vscode', () => {
    vi.stubEnv('GEMINI_CLI_SURFACE', '');
    vi.stubEnv('SURFACE', '');
    vi.stubEnv('GITHUB_SHA', '');
    vi.stubEnv('TERM_PROGRAM', '');
    vi.stubEnv('REPLIT_USER', 'someone');
    expect(determineSurface()).toBe('replit');
  });

  it('should detect JetBrains IDE via TERMINAL_EMULATOR', () => {
    vi.stubEnv('GEMINI_CLI_SURFACE', '');
    vi.stubEnv('SURFACE', '');
    vi.stubEnv('GITHUB_SHA', '');
    vi.stubEnv('TERM_PROGRAM', '');
    vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');
    expect(determineSurface()).toBe('jetbrains');
  });

  it('should return SURFACE_NOT_SET when no surface is detected', () => {
    vi.stubEnv('GEMINI_CLI_SURFACE', '');
    vi.stubEnv('SURFACE', '');
    vi.stubEnv('GITHUB_SHA', '');
    vi.stubEnv('TERM_PROGRAM', '');
    vi.stubEnv('CLOUD_SHELL', '');
    vi.stubEnv('EDITOR_IN_CLOUD_SHELL', '');
    expect(determineSurface()).toBe(SURFACE_NOT_SET);
  });
});
