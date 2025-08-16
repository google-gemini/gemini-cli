/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { detectIde, detectIdeByEnvVar, DetectedIde } from './detect-ide.js';

describe('detectIde', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return undefined when no IDE is detected', () => {
    expect(detectIdeByEnvVar()).toBeUndefined();
  });

  it('should detect Devin when __COG_BASHRC_SOURCED is set', () => {
    process.env['__COG_BASHRC_SOURCED'] = 'true';
    expect(detectIdeByEnvVar()).toBe(DetectedIde.Devin);
  });

  it('should detect Replit when REPLIT_USER is set', () => {
    process.env['REPLIT_USER'] = 'test';
    expect(detectIdeByEnvVar()).toBe(DetectedIde.Replit);
  });

  it('should detect Cursor when CURSOR_TRACE_ID is set', () => {
    process.env['CURSOR_TRACE_ID'] = 'test';
    expect(detectIdeByEnvVar()).toBe(DetectedIde.Cursor);
  });

  it('should detect Codespaces when CODESPACES is set', () => {
    process.env['CODESPACES'] = 'true';
    expect(detectIdeByEnvVar()).toBe(DetectedIde.Codespaces);
  });

  it('should detect Cloud Shell when EDITOR_IN_CLOUD_SHELL is set', () => {
    process.env['EDITOR_IN_CLOUD_SHELL'] = 'true';
    expect(detectIdeByEnvVar()).toBe(DetectedIde.CloudShell);
  });

  it('should detect Cloud Shell when CLOUD_SHELL is set', () => {
    process.env['CLOUD_SHELL'] = 'true';
    expect(detectIdeByEnvVar()).toBe(DetectedIde.CloudShell);
  });

  it('should detect Trae when TERM_PRODUCT is set to Trae', () => {
    process.env['TERM_PRODUCT'] = 'Trae';
    expect(detectIdeByEnvVar()).toBe(DetectedIde.Trae);
  });

  it('should detect Firebase Studio when FIREBASE_DEPLOY_AGENT is set', () => {
    process.env['FIREBASE_DEPLOY_AGENT'] = 'true';
    expect(detectIdeByEnvVar()).toBe(DetectedIde.FirebaseStudio);
  });

  it('should detect Firebase Studio when MONOSPACE_ENV is set', () => {
    process.env['MONOSPACE_ENV'] = 'true';
    expect(detectIdeByEnvVar()).toBe(DetectedIde.FirebaseStudio);
  });

  it('should detect VSCode when TERM_PROGRAM is vscode', () => {
    process.env['TERM_PROGRAM'] = 'vscode';
    expect(detectIdeByEnvVar()).toBe(DetectedIde.VSCode);
  });

  it('should detect a VSCode fork when the command includes "vscode" (case-insensitive) and TERM_PROGRAM is vscode', () => {
    process.env['TERM_PROGRAM'] = 'vscode';
    expect(detectIde('path/to/vscode-fork')).toBe(DetectedIde.VSCodeFork);
    expect(detectIde('path/to/VSCODE-fork')).toBe(DetectedIde.VSCodeFork);
  });
});
