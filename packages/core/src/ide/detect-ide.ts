/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum SupportedIDE {
  VSCode = 'vscode',
}

export function getIdeDisplayName(ide: SupportedIDE): string {
  switch (ide) {
    case SupportedIDE.VSCode:
      return 'VSCode';
    default:
      throw new Error(`Unsupported IDE: ${ide}`);
  }
}

export function detectIde(): SupportedIDE | undefined {
  if (process.env.TERM_PROGRAM === 'vscode') {
    return SupportedIDE.VSCode;
  }
  return undefined;
}
