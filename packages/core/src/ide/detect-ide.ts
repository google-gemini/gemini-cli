/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum DetectedIde {
  Devin = 'devin',
  Replit = 'replit',
  VSCode = 'vscode',
  VSCodeFork = 'vscode-fork',
  Cursor = 'cursor',
  CloudShell = 'cloudshell',
  Codespaces = 'codespaces',
  FirebaseStudio = 'firebasestudio',
  Trae = 'trae',
}

export interface IdeInfo {
  displayName: string;
}

export function getIdeInfo(ide: DetectedIde): IdeInfo {
  switch (ide) {
    case DetectedIde.Devin:
      return {
        displayName: 'Devin',
      };
    case DetectedIde.Replit:
      return {
        displayName: 'Replit',
      };
    case DetectedIde.VSCode:
    case DetectedIde.VSCodeFork:
      return {
        displayName: 'VS Code',
      };
    case DetectedIde.Cursor:
      return {
        displayName: 'Cursor',
      };
    case DetectedIde.CloudShell:
      return {
        displayName: 'Cloud Shell',
      };
    case DetectedIde.Codespaces:
      return {
        displayName: 'GitHub Codespaces',
      };
    case DetectedIde.FirebaseStudio:
      return {
        displayName: 'Firebase Studio',
      };
    case DetectedIde.Trae:
      return {
        displayName: 'Trae',
      };
    default: {
      // This ensures that if a new IDE is added to the enum, we get a compile-time error.
      const exhaustiveCheck: never = ide;
      return exhaustiveCheck;
    }
  }
}

// Detects the current IDE using only environment variables.
export function detectIdeByEnvVar(): DetectedIde | undefined {
  if (process.env.__COG_BASHRC_SOURCED) {
    return DetectedIde.Devin;
  }
  if (process.env.REPLIT_USER) {
    return DetectedIde.Replit;
  }
  if (process.env.CURSOR_TRACE_ID) {
    return DetectedIde.Cursor;
  }
  if (process.env.CODESPACES) {
    return DetectedIde.Codespaces;
  }
  if (process.env.EDITOR_IN_CLOUD_SHELL || process.env.CLOUD_SHELL) {
    return DetectedIde.CloudShell;
  }
  if (process.env.TERM_PRODUCT === 'Trae') {
    return DetectedIde.Trae;
  }
  if (process.env.FIREBASE_DEPLOY_AGENT || process.env.MONOSPACE_ENV) {
    return DetectedIde.FirebaseStudio;
  }
  if (process.env.TERM_PROGRAM === 'vscode') {
    return DetectedIde.VSCode;
  }
  return;
}

// More precise-- detects the current IDE using environment variables and the current command.
export function detectIde(command: string): DetectedIde | undefined {
  const ide = detectIdeByEnvVar();
  if (ide === DetectedIde.VSCode) {
    if (command && command.toLowerCase().includes('vscode')) {
      return DetectedIde.VSCode;
    }
    return DetectedIde.VSCodeFork;
  }
  return ide;
}
