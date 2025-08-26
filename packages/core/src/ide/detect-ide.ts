/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum DetectedIde {
  Devin = 'devin',
  Replit = 'replit',
  Cursor = 'cursor',
  CloudShell = 'cloudshell',
  Codespaces = 'codespaces',
  FirebaseStudio = 'firebasestudio',
  Trae = 'trae',
  VSCode = 'vscode',
  VSCodeFork = 'vscodefork',
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
    case DetectedIde.VSCode:
      return {
        displayName: 'VS Code',
      };
    case DetectedIde.VSCodeFork:
      return {
        displayName: 'IDE',
      };
    default: {
      // This ensures that if a new IDE is added to the enum, we get a compile-time error.
      const exhaustiveCheck: never = ide;
      return exhaustiveCheck;
    }
  }
}

export function detectIdeFromEnv(): DetectedIde {
  if (process.env['__COG_BASHRC_SOURCED']) {
    return DetectedIde.Devin;
  }
  if (process.env['REPLIT_USER']) {
    return DetectedIde.Replit;
  }
  if (process.env['CURSOR_TRACE_ID']) {
    return DetectedIde.Cursor;
  }
  if (process.env['CODESPACES']) {
    return DetectedIde.Codespaces;
  }
  if (process.env['EDITOR_IN_CLOUD_SHELL'] || process.env['CLOUD_SHELL']) {
    return DetectedIde.CloudShell;
  }
  if (process.env['TERM_PRODUCT'] === 'Trae') {
    return DetectedIde.Trae;
  }
  if (process.env['MONOSPACE_ENV']) {
    return DetectedIde.FirebaseStudio;
  }
  return DetectedIde.VSCode;
}

function verifyVSCode(
  ide: DetectedIde,
  ideProcessInfo: {
    pid: number;
    command: string;
  },
): DetectedIde {
  if (ide !== DetectedIde.VSCode) {
    return ide;
  }
  if (ideProcessInfo.command.toLowerCase().includes('code')) {
    return DetectedIde.VSCode;
  }
  return DetectedIde.VSCodeFork;
}

export function detectIde(ideProcessInfo: {
  pid: number;
  command: string;
}): DetectedIde | undefined {
  // Only VSCode-based integrations are currently supported.
  if (process.env['TERM_PROGRAM'] !== 'vscode') {
    return undefined;
  }

  const ide = detectIdeFromEnv();
  return verifyVSCode(ide, ideProcessInfo);
}
