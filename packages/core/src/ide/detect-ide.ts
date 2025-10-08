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
  jetbrains: { name: 'jetbrains', displayName: 'JetBrains IDE' },
  intellijidea: { name: 'intellijidea', displayName: 'IntelliJ IDEA' },
  webstorm: { name: 'webstorm', displayName: 'WebStorm' },
  pycharm: { name: 'pycharm', displayName: 'PyCharm' },
  goland: { name: 'goland', displayName: 'GoLand' },
  androidstudio: { name: 'androidstudio', displayName: 'Android Studio' },
  clion: { name: 'clion', displayName: 'CLion' },
  rustrover: { name: 'rustrover', displayName: 'RustRover' },
  datagrip: { name: 'datagrip', displayName: 'DataGrip' },
} as const;

export interface IdeInfo {
  name: string;
  displayName: string;
}

export function isCloudShell(): boolean {
  return !!(process.env['EDITOR_IN_CLOUD_SHELL'] || process.env['CLOUD_SHELL']);
}

export function detectIdeFromEnv(): IdeInfo {
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
  if (process.env['TERMINAL_EMULATOR']?.includes('JetBrains')) {
    return IDE_DEFINITIONS.jetbrains;
  }
  return IDE_DEFINITIONS.vscode;
}

function verifyVSCode(
  ide: IdeInfo,
  ideProcessInfo: {
    pid: number;
    command: string;
  },
): IdeInfo {
  if (ide.name !== IDE_DEFINITIONS.vscode.name) {
    return ide;
  }
  if (ideProcessInfo.command.toLowerCase().includes('code')) {
    return IDE_DEFINITIONS.vscode;
  }
  return IDE_DEFINITIONS.vscodefork;
}

function verifyJetBrains(
  ide: IdeInfo,
  ideProcessInfo: {
    pid: number;
    command: string;
  },
): IdeInfo {
  const command = ideProcessInfo.command.toLowerCase();
  if (command.includes('idea')) {
    return IDE_DEFINITIONS.intellijidea;
  }
  if (command.includes('webstorm')) {
    return IDE_DEFINITIONS.webstorm;
  }
  if (command.includes('pycharm')) {
    return IDE_DEFINITIONS.pycharm;
  }
  if (command.includes('goland')) {
    return IDE_DEFINITIONS.goland;
  }
  if (command.includes('studio')) {
    return IDE_DEFINITIONS.androidstudio;
  }
  if (command.includes('clion')) {
    return IDE_DEFINITIONS.clion;
  }
  if (command.includes('rustrover')) {
    return IDE_DEFINITIONS.rustrover;
  }
  if (command.includes('datagrip')) {
    return IDE_DEFINITIONS.datagrip;
  }
  return ide;
}

export function detectIde(
  ideProcessInfo: {
    pid: number;
    command: string;
  },
  ideInfoFromFile?: { name?: string; displayName?: string },
): IdeInfo | undefined {
  if (ideInfoFromFile?.name && ideInfoFromFile.displayName) {
    return {
      name: ideInfoFromFile.name,
      displayName: ideInfoFromFile.displayName,
    };
  }

  const isJetBrains = process.env['TERMINAL_EMULATOR']?.includes('JetBrains');
  if (isJetBrains) {
    return verifyJetBrains(IDE_DEFINITIONS.jetbrains, ideProcessInfo);
  }

  const isVscode = process.env['TERM_PROGRAM'] === 'vscode';
  if (isVscode) {
    const ide = detectIdeFromEnv();
    return verifyVSCode(ide, ideProcessInfo);
  }

  return undefined;
}
