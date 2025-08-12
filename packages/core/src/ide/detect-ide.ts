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

export interface IdeInfo {
  displayName: string;
  isExtensionInstalledByDefault: boolean;
}

export function getIdeInfo(ide: DetectedIde): IdeInfo {
  switch (ide) {
    case DetectedIde.VSCode:
      return {
        displayName: 'VS Code',
        isExtensionInstalledByDefault: false,
      };
    case DetectedIde.VSCodium:
      return {
        displayName: 'VSCodium',
        isExtensionInstalledByDefault: false,
      };
    case DetectedIde.Cursor:
      return {
        displayName: 'Cursor',
        isExtensionInstalledByDefault: false,
      };
    case DetectedIde.CloudShell:
      return {
        displayName: 'Cloud Shell',
        isExtensionInstalledByDefault: true,
      };
    case DetectedIde.Codespaces:
      return {
        displayName: 'GitHub Codespaces',
        isExtensionInstalledByDefault: false,
      };
    case DetectedIde.Windsurf:
      return {
        displayName: 'Windsurf',
        isExtensionInstalledByDefault: false,
      };
    case DetectedIde.FirebaseStudio:
      return {
        displayName: 'Firebase Studio',
        isExtensionInstalledByDefault: true,
      };
    case DetectedIde.Trae:
      return {
        displayName: 'Trae',
        isExtensionInstalledByDefault: false,
      };
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
