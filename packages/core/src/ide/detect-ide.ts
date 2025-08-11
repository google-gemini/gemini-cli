/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum DetectedIde {
  VSCode = 'vscode',
  VSCodium = 'vscodium',
  Cursor = 'cursor',
  CloudShell = 'cloudshell',
  Codespaces = 'codespaces',
  Windsurf = 'windsurf',
  FirebaseStudio = 'firebasestudio',
  Trae = 'trae',
}

export function getIdeDisplayName(ide: DetectedIde): string {
  switch (ide) {
    case DetectedIde.VSCode:
      return 'VS Code';
    case DetectedIde.VSCodium:
      return 'VSCodium';
    case DetectedIde.Cursor:
      return 'Cursor';
    case DetectedIde.CloudShell:
      return 'Cloud Shell';
    case DetectedIde.Codespaces:
      return 'GitHub Codespaces';
    case DetectedIde.Windsurf:
      return 'Windsurf';
    case DetectedIde.FirebaseStudio:
      return 'Firebase Studio';
    case DetectedIde.Trae:
      return 'Trae';
    default: {
      // This ensures that if a new IDE is added to the enum, we get a compile-time error.
      const exhaustiveCheck: never = ide;
      return exhaustiveCheck;
    }
  }
}

export function detectIde(): DetectedIde | undefined {
  // Only VSCode-based integrations are currently supported.
  if (process.env.TERM_PROGRAM !== 'vscode') {
    return undefined;
  }
  if (process.env.CURSOR_TRACE_ID) {
    return DetectedIde.Cursor;
  }
  if (process.env.CODESPACES) {
    return DetectedIde.Codespaces;
  }
  if (process.env.EDITOR_IN_CLOUD_SHELL) {
    return DetectedIde.CloudShell;
  }
  if (process.env.TERM_PRODUCT === 'Trae') {
    return DetectedIde.Trae;
  }
  if (process.env.FIREBASE_DEPLOY_AGENT) {
    return DetectedIde.FirebaseStudio;
  }
  return DetectedIde.VSCode;
}
