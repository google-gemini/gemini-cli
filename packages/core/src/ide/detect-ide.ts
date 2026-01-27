/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const IDE_DEFINITIONS = {
  devin: { name: 'devin', displayName: 'Devin' },
  replit: { name: 'replit', displayName: 'Replit' },
  cursor: { name: 'cursor', displayName: 'Cursor' },
  cloudshell: { name: 'cloudshell', displayName: 'Cloud Shell' },
  codespaces: { name: 'codespaces', displayName: 'GitHub Codespaces' },
  firebasestudio: { name: 'firebasestudio', displayName: 'Firebase Studio' },
  trae: { name: 'trae', displayName: 'Trae' },
  vscode: { name: 'vscode', displayName: 'VS Code' },
  vscodefork: { name: 'vscodefork', displayName: 'IDE' },
  antigravity: { name: 'antigravity', displayName: 'Antigravity' },
  sublimetext: { name: 'sublimetext', displayName: 'Sublime Text' },
  jetbrains: { name: 'jetbrains', displayName: 'JetBrains IDE' },
  intellijidea: { name: 'intellijidea', displayName: 'IntelliJ IDEA' },
  webstorm: { name: 'webstorm', displayName: 'WebStorm' },
  pycharm: { name: 'pycharm', displayName: 'PyCharm' },
  goland: { name: 'goland', displayName: 'GoLand' },
  androidstudio: { name: 'androidstudio', displayName: 'Android Studio' },
  clion: { name: 'clion', displayName: 'CLion' },
  rustrover: { name: 'rustrover', displayName: 'RustRover' },
  datagrip: { name: 'datagrip', displayName: 'DataGrip' },
  phpstorm: { name: 'phpstorm', displayName: 'PhpStorm' },
} as const;

export interface IdeInfo {
  name: string;
  displayName: string;
}

export function isCloudShell(): boolean {
  return !!(process.env['EDITOR_IN_CLOUD_SHELL'] || process.env['CLOUD_SHELL']);
}

export function isJetBrains(): boolean {
  return !!process.env['TERMINAL_EMULATOR']
    ?.toLowerCase()
    .includes('jetbrains');
}

export function detectIdeFromEnv(): IdeInfo {
  if (process.env['ANTIGRAVITY_CLI_ALIAS']) {
    return IDE_DEFINITIONS.antigravity;
  }
  if (process.env['__COG_BASHRC_SOURCED']) {
    return IDE_DEFINITIONS.devin;
  }
  if (process.env['REPLIT_USER']) {
    return IDE_DEFINITIONS.replit;
  }
  if (process.env['CURSOR_TRACE_ID']) {
    return IDE_DEFINITIONS.cursor;
  }
  if (process.env['CODESPACES']) {
    return IDE_DEFINITIONS.codespaces;
  }
  if (isCloudShell()) {
    return IDE_DEFINITIONS.cloudshell;
  }
  if (process.env['TERM_PRODUCT'] === 'Trae') {
    return IDE_DEFINITIONS.trae;
  }
  if (process.env['MONOSPACE_ENV']) {
    return IDE_DEFINITIONS.firebasestudio;
  }
  if (process.env['TERM_PROGRAM'] === 'sublime') {
    return IDE_DEFINITIONS.sublimetext;
  }
  if (isJetBrains()) {
    return IDE_DEFINITIONS.jetbrains;
  }
  return IDE_DEFINITIONS.vscode;
}

export function detectIde(ideInfoFromFile?: {
  name?: string;
  displayName?: string;
}): IdeInfo | undefined {
  if (ideInfoFromFile?.name && ideInfoFromFile.displayName) {
    return {
      name: ideInfoFromFile.name,
      displayName: ideInfoFromFile.displayName,
    };
  }

  // Only VS Code, Sublime Text and JetBrains integrations are currently supported.
  if (
    process.env['TERM_PROGRAM'] !== 'vscode' &&
    process.env['TERM_PROGRAM'] !== 'sublime' &&
    !isJetBrains()
  ) {
    return undefined;
  }

  return detectIdeFromEnv();
}
