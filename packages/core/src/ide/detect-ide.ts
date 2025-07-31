/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum DetectedIde {
  VSCode = 'vscode',
}

export function getIdeDisplayName(ide: DetectedIde): string {
  switch (ide) {
    case DetectedIde.VSCode:
      return 'VSCode';
    default:
      throw new Error(`Unsupported IDE: ${ide}`);
  }
}

export function detectIde(): DetectedIde | undefined {
  if (process.env.TERM_PROGRAM === 'vscode') {
    return DetectedIde.VSCode;
  }
  return undefined;
}
