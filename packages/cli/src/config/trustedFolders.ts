/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { homedir, platform } from 'os';
import { getErrorMessage } from '@google/gemini-cli-core';
import stripJsonComments from 'strip-json-comments';
import { SettingScope } from './settings.js';

export const TRUSTED_FOLDERS_FILENAME = 'trustedFolders.json';
export const SETTINGS_DIRECTORY_NAME = '.gemini';
export const USER_SETTINGS_DIR = path.join(homedir(), SETTINGS_DIRECTORY_NAME);
export const USER_TRUSTED_FOLDERS_PATH = path.join(
  USER_SETTINGS_DIR,
  TRUSTED_FOLDERS_FILENAME,
);

export function getSystemTrustedFoldersPath(): string {
  if (process.env.GEMINI_CLI_SYSTEM_TRUSTED_FOLDERS_PATH) {
    return process.env.GEMINI_CLI_SYSTEM_TRUSTED_FOLDERS_PATH;
  }
  if (platform() === 'darwin') {
    return `/Library/Application Support/GeminiCli/${TRUSTED_FOLDERS_FILENAME}`;
  } else if (platform() === 'win32') {
    return `C:/ProgramData/gemini-cli/${TRUSTED_FOLDERS_FILENAME}`;
  } else {
    return `/etc/gemini-cli/${TRUSTED_FOLDERS_FILENAME}`;
  }
}

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
    public system: TrustedFoldersFile,
    public user: TrustedFoldersFile,
    public errors: TrustedFoldersError[],
  ) {}

  get rules(): TrustRule[] {
    const mergedConfig = { ...this.user.config, ...this.system.config };
    return Object.entries(mergedConfig).map(([path, trustLevel]) => ({
      path,
      trustLevel,
    }));
  }

  forScope(scope: SettingScope): TrustedFoldersFile {
    switch (scope) {
      case SettingScope.User:
        return this.user;
      case SettingScope.System:
        return this.system;
      default:
        throw new Error(`Invalid scope: ${scope}`);
    }
  }

  setValue(scope: SettingScope, path: string, trustLevel: TrustLevel): void {
    const fileToUpdate = this.forScope(scope);
    fileToUpdate.config[path] = trustLevel;
    saveTrustedFolders(fileToUpdate);
  }
}

export function loadTrustedFolders(): LoadedTrustedFolders {
  const errors: TrustedFoldersError[] = [];
  const systemConfig: Record<string, TrustLevel> = {};
  const userConfig: Record<string, TrustLevel> = {};

  const systemPath = getSystemTrustedFoldersPath();
  const userPath = USER_TRUSTED_FOLDERS_PATH;

  // Load system trusted folders
  try {
    if (fs.existsSync(systemPath)) {
      const content = fs.readFileSync(systemPath, 'utf-8');
      const parsed = JSON.parse(stripJsonComments(content)) as Record<
        string,
        TrustLevel
      >;
      if (parsed) {
        Object.assign(systemConfig, parsed);
      }
    }
  } catch (error: unknown) {
    errors.push({
      message: getErrorMessage(error),
      path: systemPath,
    });
  }

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
    { path: systemPath, config: systemConfig },
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

export function isCurrentDirectoryTrusted(): boolean | undefined {
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
  const normalizedCwd = path.normalize(cwd);

  for (const trustedPath of trustedPaths) {
    const normalizedTrustedPath = path.normalize(trustedPath);
    if (normalizedCwd === normalizedTrustedPath) {
      return true;
    }
    const trustedPathWithSep = normalizedTrustedPath.endsWith(path.sep)
      ? normalizedTrustedPath
      : `${normalizedTrustedPath}${path.sep}`;
    if (normalizedCwd.startsWith(trustedPathWithSep)) {
      return true;
    }
  }

  for (const untrustedPath of untrustedPaths) {
    const normalizedUntrustedPath = path.normalize(untrustedPath);
    if (normalizedCwd === normalizedUntrustedPath) {
      return false;
    }
  }

  return undefined;
}
