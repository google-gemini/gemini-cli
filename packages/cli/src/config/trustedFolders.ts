/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { getErrorMessage, isWithinRoot } from '@google/gemini-cli-core';
import stripJsonComments from 'strip-json-comments';

export const TRUSTED_FOLDERS_FILENAME = 'trustedFolders.json';
export const SETTINGS_DIRECTORY_NAME = '.gemini';
export const USER_SETTINGS_DIR = path.join(homedir(), SETTINGS_DIRECTORY_NAME);
export const USER_TRUSTED_FOLDERS_PATH = path.join(
  USER_SETTINGS_DIR,
  TRUSTED_FOLDERS_FILENAME,
);

export enum TrustLevel {
  TRUST_FOLDER = 'TRUST_FOLDER',
  TRUST_PARENT = 'TRUST_PARENT',
  DO_NOT_TRUST = 'DO_NOT_TRUST',
}

export interface TrustRule {
  path: string;
  trustLevel: TrustLevel;
}

export interface TrustedFoldersError {
  message: string;
  path: string;
}

export interface TrustedFoldersFile {
  config: Record<string, TrustLevel>;
  path: string;
}

export class LoadedTrustedFolders {
  constructor(
    public user: TrustedFoldersFile,
    public errors: TrustedFoldersError[],
  ) {}

  get rules(): TrustRule[] {
    return Object.entries(this.user.config).map(([path, trustLevel]) => ({
      path,
      trustLevel,
    }));
  }

  setValue(path: string, trustLevel: TrustLevel): void {
    this.user.config[path] = trustLevel;
    saveTrustedFolders(this.user);
  }
}

export function loadTrustedFolders(): LoadedTrustedFolders {
  const errors: TrustedFoldersError[] = [];
  const userConfig: Record<string, TrustLevel> = {};

  const userPath = USER_TRUSTED_FOLDERS_PATH;

  // Load user trusted folders
  try {
    if (fs.existsSync(userPath)) {
      const content = fs.readFileSync(userPath, 'utf-8');
      const parsed = JSON.parse(stripJsonComments(content)) as Record<
        string,
        TrustLevel
      >;
      if (parsed) {
        Object.assign(userConfig, parsed);
      }
    }
  } catch (error: unknown) {
    errors.push({
      message: getErrorMessage(error),
      path: userPath,
    });
  }

  return new LoadedTrustedFolders(
    { path: userPath, config: userConfig },
    errors,
  );
}

export function saveTrustedFolders(
  trustedFoldersFile: TrustedFoldersFile,
): void {
  try {
    // Ensure the directory exists
    const dirPath = path.dirname(trustedFoldersFile.path);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(
      trustedFoldersFile.path,
      JSON.stringify(trustedFoldersFile.config, null, 2),
      'utf-8',
    );
  } catch (error) {
    console.error('Error saving trusted folders file:', error);
  }
}

export function isWorkspaceTrusted(): boolean | undefined {
  const { rules, errors } = loadTrustedFolders();

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(
        `Error loading trusted folders config from ${error.path}: ${error.message}`,
      );
    }
  }

  const trustedPaths: string[] = [];
  const untrustedPaths: string[] = [];

  for (const rule of rules) {
    switch (rule.trustLevel) {
      case TrustLevel.TRUST_FOLDER:
        trustedPaths.push(rule.path);
        break;
      case TrustLevel.TRUST_PARENT:
        trustedPaths.push(path.dirname(rule.path));
        break;
      case TrustLevel.DO_NOT_TRUST:
        untrustedPaths.push(rule.path);
        break;
      default:
        // Do nothing for unknown trust levels.
        break;
    }
  }

  const cwd = process.cwd();

  for (const trustedPath of trustedPaths) {
    if (isWithinRoot(cwd, trustedPath)) {
      return true;
    }
  }

  for (const untrustedPath of untrustedPaths) {
    if (path.normalize(cwd) === path.normalize(untrustedPath)) {
      return false;
    }
  }

  return undefined;
}
