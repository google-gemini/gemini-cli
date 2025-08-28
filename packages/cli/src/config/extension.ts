/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  MCPServerConfig,
  GeminiCLIExtension,
} from '@google/gemini-cli-core';
import { Storage } from '@google/gemini-cli-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { simpleGit } from 'simple-git';
import {
  SettingScope,
  loadSettings,
  getSystemSettingsBasePath,
} from '../config/settings.js';
import { getErrorMessage } from '../utils/errors.js';
import { recursivelyHydrateStrings } from './extensions/variables.js';

export const EXTENSIONS_DIRECTORY_NAME = '.gemini/extensions';

export const EXTENSIONS_CONFIG_FILENAME = 'gemini-extension.json';
export const INSTALL_METADATA_FILENAME = '.gemini-extension-install.json';

export interface Extension {
  path: string;
  config: ExtensionConfig;
  contextFiles: string[];
  installMetadata?: ExtensionInstallMetadata | undefined;
}

export interface ExtensionConfig {
  name: string;
  version: string;
  mcpServers?: Record<string, MCPServerConfig>;
  contextFileName?: string | string[];
  excludeTools?: string[];
}

export interface ExtensionInstallMetadata {
  source: string;
  type: 'git' | 'local';
}

export interface ExtensionUpdateInfo {
  originalVersion: string;
  updatedVersion: string;
}

export enum InstallLocation {
  User = 'User',
  System = 'System',
}

export class ExtensionStorage {
  private readonly extensionName: string;
  private readonly location: InstallLocation;

  constructor(extensionName: string, location: InstallLocation) {
    this.extensionName = extensionName;
    this.location = location;
    const extensionsDir =
      location === InstallLocation.System
        ? ExtensionStorage.getSystemExtensionsDir()
        : ExtensionStorage.getUserExtensionsDir();
    fs.mkdirSync(extensionsDir, { recursive: true });
  }

  getExtensionDir(): string {
    return path.join(
      this.location === InstallLocation.System
        ? ExtensionStorage.getSystemExtensionsDir()
        : ExtensionStorage.getUserExtensionsDir(),
      this.extensionName,
    );
  }

  getConfigPath(): string {
    return path.join(this.getExtensionDir(), EXTENSIONS_CONFIG_FILENAME);
  }

  static getUserExtensionsDir(): string {
    const storage = new Storage(os.homedir());
    return storage.getExtensionsDir();
  }

  static getSystemExtensionsDir(): string {
    const storage = new Storage(getSystemSettingsBasePath());
    return storage.getExtensionsDir();
  }

  static async createTmpDir(): Promise<string> {
    return await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'gemini-extension'),
    );
  }
}

export function getWorkspaceExtensions(workspaceDir: string): Extension[] {
  return loadExtensionsFromDir(workspaceDir);
}

export async function performWorkspaceExtensionMigration(
  extensions: Extension[],
): Promise<string[]> {
  const failedInstallNames: string[] = [];

  for (const extension of extensions) {
    try {
      const installMetadata: ExtensionInstallMetadata = {
        source: extension.path,
        type: 'local',
      };
      await installExtension(installMetadata, InstallLocation.User);
    } catch (_) {
      failedInstallNames.push(extension.config.name);
    }
  }
  return failedInstallNames;
}

export function loadExtensions(workspaceDir: string): Extension[] {
  const settings = loadSettings(workspaceDir).merged;
  const disabledExtensions = settings.extensions?.disabled ?? [];
  const allExtensions = [
    ...loadExtensionsForLocation(InstallLocation.System),
    ...loadExtensionsForLocation(InstallLocation.User),
  ];

  if (!settings.experimental?.extensionManagement) {
    allExtensions.push(
      ...loadExtensionsFromDir(new Storage(workspaceDir).getExtensionsDir()),
    );
  }

  const uniqueExtensions = new Map<string, Extension>();
  for (const extension of allExtensions) {
    if (
      !uniqueExtensions.has(extension.config.name) &&
      !disabledExtensions.includes(extension.config.name)
    ) {
      uniqueExtensions.set(extension.config.name, extension);
    }
  }

  return Array.from(uniqueExtensions.values());
}

export function loadExtensionsForLocation(
  location: InstallLocation,
): Extension[] {
  return location === InstallLocation.System
    ? loadExtensionsFromDir(ExtensionStorage.getSystemExtensionsDir())
    : loadExtensionsFromDir(ExtensionStorage.getUserExtensionsDir());
}

export function loadExtensionsFromDir(extensionsDir: string): Extension[] {
  if (!fs.existsSync(extensionsDir)) {
    return [];
  }

  const extensions: Extension[] = [];
  for (const subdir of fs.readdirSync(extensionsDir)) {
    const extensionDir = path.join(extensionsDir, subdir);

    const extension = loadExtension(extensionDir);
    if (extension != null) {
      extensions.push(extension);
    }
  }
  return extensions;
}

export function loadExtension(extensionDir: string): Extension | null {
  if (!fs.statSync(extensionDir).isDirectory()) {
    console.error(
      `Warning: unexpected file ${extensionDir} in extensions directory.`,
    );
    return null;
  }

  const configFilePath = path.join(extensionDir, EXTENSIONS_CONFIG_FILENAME);
  if (!fs.existsSync(configFilePath)) {
    console.error(
      `Warning: extension directory ${extensionDir} does not contain a config file ${configFilePath}.`,
    );
    return null;
  }

  try {
    const configContent = fs.readFileSync(configFilePath, 'utf-8');
    const config = recursivelyHydrateStrings(JSON.parse(configContent), {
      extensionPath: extensionDir,
      '/': path.sep,
      pathSeparator: path.sep,
    }) as unknown as ExtensionConfig;
    if (!config.name || !config.version) {
      console.error(
        `Invalid extension config in ${configFilePath}: missing name or version.`,
      );
      return null;
    }

    const contextFiles = getContextFileNames(config)
      .map((contextFileName) => path.join(extensionDir, contextFileName))
      .filter((contextFilePath) => fs.existsSync(contextFilePath));

    return {
      path: extensionDir,
      config,
      contextFiles,
      installMetadata: loadInstallMetadata(extensionDir),
    };
  } catch (e) {
    console.error(
      `Warning: error parsing extension config in ${configFilePath}: ${getErrorMessage(
        e,
      )}`,
    );
    return null;
  }
}

function loadInstallMetadata(
  extensionDir: string,
): ExtensionInstallMetadata | undefined {
  const metadataFilePath = path.join(extensionDir, INSTALL_METADATA_FILENAME);
  try {
    const configContent = fs.readFileSync(metadataFilePath, 'utf-8');
    const metadata = JSON.parse(configContent) as ExtensionInstallMetadata;
    return metadata;
  } catch (_e) {
    return undefined;
  }
}

function getContextFileNames(config: ExtensionConfig): string[] {
  if (!config.contextFileName) {
    return ['GEMINI.md'];
  } else if (!Array.isArray(config.contextFileName)) {
    return [config.contextFileName];
  }
  return config.contextFileName;
}

/**
 * Returns an annotated list of extensions. If an extension is listed in enabledExtensionNames, it will be active.
 * If enabledExtensionNames is empty, an extension is active unless it is in list of disabled extensions in settings.
 * @param extensions The base list of extensions.
 * @param enabledExtensionNames The names of explicitly enabled extensions.
 * @param workspaceDir The current workspace directory.
 */
export function annotateActiveExtensions(
  extensions: Extension[],
  enabledExtensionNames: string[],
  workspaceDir: string,
): GeminiCLIExtension[] {
  const settings = loadSettings(workspaceDir).merged;
  const disabledExtensions = settings.extensions?.disabled ?? [];

  const annotatedExtensions: GeminiCLIExtension[] = [];

  if (enabledExtensionNames.length === 0) {
    return extensions.map((extension) => ({
      name: extension.config.name,
      version: extension.config.version,
      isActive: !disabledExtensions.includes(extension.config.name),
      path: extension.path,
    }));
  }

  const lowerCaseEnabledExtensions = new Set(
    enabledExtensionNames.map((e) => e.trim().toLowerCase()),
  );

  if (
    lowerCaseEnabledExtensions.size === 1 &&
    lowerCaseEnabledExtensions.has('none')
  ) {
    return extensions.map((extension) => ({
      name: extension.config.name,
      version: extension.config.version,
      isActive: false,
      path: extension.path,
    }));
  }

  const notFoundNames = new Set(lowerCaseEnabledExtensions);

  for (const extension of extensions) {
    const lowerCaseName = extension.config.name.toLowerCase();
    const isActive = lowerCaseEnabledExtensions.has(lowerCaseName);

    if (isActive) {
      notFoundNames.delete(lowerCaseName);
    }

    annotatedExtensions.push({
      name: extension.config.name,
      version: extension.config.version,
      isActive,
      path: extension.path,
    });
  }

  for (const requestedName of notFoundNames) {
    console.error(`Extension not found: ${requestedName}`);
  }

  return annotatedExtensions;
}

/**
 * Clones a Git repository to a specified local path.
 * @param gitUrl The Git URL to clone.
 * @param destination The destination path to clone the repository to.
 */
async function cloneFromGit(
  gitUrl: string,
  destination: string,
): Promise<void> {
  try {
    // TODO(chrstnb): Download the archive instead to avoid unnecessary .git info.
    await simpleGit().clone(gitUrl, destination, ['--depth', '1']);
  } catch (error) {
    throw new Error(`Failed to clone Git repository from ${gitUrl}`, {
      cause: error,
    });
  }
}

/**
 * Copies an extension from a source to a destination path.
 * @param source The source path of the extension.
 * @param destination The destination path to copy the extension to.
 */
async function copyExtension(
  source: string,
  destination: string,
): Promise<void> {
  await fs.promises.cp(source, destination, { recursive: true });
}

/**
 * Handles the extension installation process based on the provided arguments.
 * It determines whether the installation source is a git repository or a local
 * path and calls the appropriate installation function.
 * Logs success or error messages to the console.
 * @param args The arguments for the install command.
 * @throws Will re-throw any error encountered during the installation process
 * after logging an error message.
 */
export async function installExtension(
  installMetadata: ExtensionInstallMetadata,
  location: InstallLocation,
  cwd: string = process.cwd(),
): Promise<string> {
  // Convert relative paths to absolute paths for the metadata file.
  if (
    installMetadata.type === 'local' &&
    !path.isAbsolute(installMetadata.source)
  ) {
    installMetadata.source = path.resolve(cwd, installMetadata.source);
  }

  let localSourcePath: string;
  let tempDir: string | undefined;
  if (installMetadata.type === 'git') {
    tempDir = await ExtensionStorage.createTmpDir();
    await cloneFromGit(installMetadata.source, tempDir);
    localSourcePath = tempDir;
  } else {
    localSourcePath = installMetadata.source;
  }
  let newExtensionName: string | undefined;
  try {
    const newExtension = loadExtension(localSourcePath);
    if (!newExtension) {
      throw new Error(
        `Invalid extension at ${installMetadata.source}. Please make sure it has a valid gemini-extension.json file.`,
      );
    }

    newExtensionName = newExtension.config.name;
    const extensionStorage = new ExtensionStorage(newExtensionName, location);
    const destinationPath = extensionStorage.getExtensionDir();

    const installedExtensions = loadExtensionsForLocation(location);
    if (
      installedExtensions.some(
        (installed) => installed.config.name === newExtensionName,
      )
    ) {
      throw new Error(
        `Extension "${newExtensionName}" is already installed. Please uninstall it first.`,
      );
    }

    if (location === InstallLocation.User) {
      const systemExtensions = loadExtensionsForLocation(
        InstallLocation.System,
      );
      if (
        systemExtensions.some(
          (systemExt) => systemExt.config.name === newExtensionName,
        )
      ) {
        throw new Error(
          `Extension "${newExtensionName}" is already installed at the system level.`,
        );
      }
    }

    await copyExtension(localSourcePath, destinationPath);

    const metadataString = JSON.stringify(installMetadata, null, 2);
    const metadataPath = path.join(destinationPath, INSTALL_METADATA_FILENAME);
    await fs.promises.writeFile(metadataPath, metadataString);
  } finally {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }

  return newExtensionName;
}

export async function uninstallExtension(
  extensionName: string,
  location: InstallLocation,
  cwd: string = process.cwd(),
): Promise<void> {
  const installedExtensions = loadExtensionsForLocation(location);
  if (
    !installedExtensions.some(
      (installed) => installed.config.name === extensionName,
    )
  ) {
    throw new Error(`Extension "${extensionName}" not found.`);
  }
  const settingScopes =
    location === InstallLocation.System
      ? [
          SettingScope.System,
          SettingScope.SystemDefaults,
          SettingScope.User,
          SettingScope.Workspace,
        ]
      : [SettingScope.User, SettingScope.Workspace];

  removeFromDisabledExtensions(extensionName, settingScopes, cwd);
  const storage = new ExtensionStorage(extensionName, location);
  return await fs.promises.rm(storage.getExtensionDir(), {
    recursive: true,
    force: true,
  });
}

export function toOutputString(extension: Extension): string {
  let output = `${extension.config.name} (${extension.config.version})`;
  output += `\n Path: ${extension.path}`;
  if (extension.installMetadata) {
    output += `\n Source: ${extension.installMetadata.source}`;
  }
  if (extension.contextFiles.length > 0) {
    output += `\n Context files:`;
    extension.contextFiles.forEach((contextFile) => {
      output += `\n  ${contextFile}`;
    });
  }
  if (extension.config.mcpServers) {
    output += `\n MCP servers:`;
    Object.keys(extension.config.mcpServers).forEach((key) => {
      output += `\n  ${key}`;
    });
  }
  if (extension.config.excludeTools) {
    output += `\n Excluded tools:`;
    extension.config.excludeTools.forEach((tool) => {
      output += `\n  ${tool}`;
    });
  }
  return output;
}

export async function updateExtension(
  extensionName: string,
  location: InstallLocation,
  cwd: string = process.cwd(),
): Promise<ExtensionUpdateInfo | undefined> {
  const installedExtensions = loadExtensionsForLocation(location);
  const extension = installedExtensions.find(
    (installed) => installed.config.name === extensionName,
  );
  if (!extension) {
    throw new Error(
      `Extension "${extensionName}" not found. Run gemini extensions list to see available extensions.`,
    );
  }
  if (!extension.installMetadata) {
    throw new Error(
      `Extension cannot be updated because it is missing the .gemini-extension.install.json file. To update manually, uninstall and then reinstall the updated version.`,
    );
  }
  const originalVersion = extension.config.version;
  const tempDir = await ExtensionStorage.createTmpDir();
  try {
    await copyExtension(extension.path, tempDir);
    await uninstallExtension(extensionName, location, cwd);
    await installExtension(extension.installMetadata, location, cwd);

    const updatedExtension = loadExtension(extension.path);
    if (!updatedExtension) {
      throw new Error('Updated extension not found after installation.');
    }
    const updatedVersion = updatedExtension.config.version;
    return {
      originalVersion,
      updatedVersion,
    };
  } catch (e) {
    console.error(
      `Error updating extension, rolling back. ${getErrorMessage(e)}`,
    );
    await copyExtension(tempDir, extension.path);
    throw e;
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

export function disableExtension(
  name: string,
  scope: SettingScope,
  cwd: string = process.cwd(),
) {
  const settings = loadSettings(cwd);
  const settingsFile = settings.forScope(scope);
  const extensionSettings = settingsFile.settings.extensions || {
    disabled: [],
  };
  const disabledExtensions = extensionSettings.disabled || [];
  if (!disabledExtensions.includes(name)) {
    disabledExtensions.push(name);
    extensionSettings.disabled = disabledExtensions;
    settings.setValue(scope, 'extensions', extensionSettings);
  }
}

export function enableExtension(
  name: string,
  scopes: SettingScope[],
  cwd: string = process.cwd(),
) {
  removeFromDisabledExtensions(name, scopes, cwd);
}

/**
 * Removes an extension from the list of disabled extensions.
 * @param name The name of the extension to remove.
 * @param scope The scopes to remove the name from.
 */
function removeFromDisabledExtensions(
  name: string,
  scopes: SettingScope[],
  cwd: string = process.cwd(),
) {
  const settings = loadSettings(cwd);
  for (const scope of scopes) {
    const settingsFile = settings.forScope(scope);
    const extensionSettings = settingsFile.settings.extensions || {
      disabled: [],
    };
    const disabledExtensions = extensionSettings.disabled || [];
    extensionSettings.disabled = disabledExtensions.filter(
      (extension) => extension !== name,
    );
    settings.setValue(scope, 'extensions', extensionSettings);
  }
}
