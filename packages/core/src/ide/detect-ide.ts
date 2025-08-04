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
      return 'VS Code';
    default: {
      // This ensures that if a new IDE is added to the enum, we get a compile-time error.
      const exhaustiveCheck: never = ide;
      return exhaustiveCheck;
    }
  }
}

export function detectIde(): DetectedIde | undefined {
  if (process.env.TERM_PROGRAM === 'vscode') {
    return DetectedIde.VSCode;
  }
  return undefined;
}
