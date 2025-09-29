/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  MCPServerConfig,
  GeminiCLIExtension,
  ExtensionInstallMetadata,
} from '@google/gemini-cli-core';
import {
  GEMINI_DIR,
  Storage,
  Config,
  ExtensionInstallEvent,
  ExtensionUninstallEvent,
  ExtensionDisableEvent,
  ExtensionEnableEvent,
  logExtensionEnable,
  logExtensionInstallEvent,
  logExtensionUninstall,
  logExtensionDisable,
} from '@google/gemini-cli-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SettingScope, loadSettings } from '../config/settings.js';
import { getErrorMessage } from '../utils/errors.js';
import { recursivelyHydrateStrings } from './extensions/variables.js';
import { isWorkspaceTrusted } from './trustedFolders.js';
import { resolveEnvVarsInObject } from '../utils/envVarResolver.js';
import { randomUUID } from 'node:crypto';
import {
  cloneFromGit,
  downloadFromGitHubRelease,
} from './extensions/github.js';
import type { LoadExtensionContext } from './extensions/variableSchema.js';
import { ExtensionEnablementManager } from './extensions/extensionEnablement.js';
import chalk from 'chalk';
import type { ConfirmationRequest } from '../ui/types.js';

export const EXTENSIONS_DIRECTORY_NAME = path.join(GEMINI_DIR, 'extensions');

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

export interface ExtensionUpdateInfo {
  name: string;
  originalVersion: string;
  updatedVersion: string;
}

export class ExtensionStorage {
  private readonly extensionName: string;

  constructor(extensionName: string) {
    this.extensionName = extensionName;
  }

  getExtensionDir(): string {
    return path.join(
      ExtensionStorage.getUserExtensionsDir(),
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

  static async createTmpDir(): Promise<string> {
    return await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'gemini-extension'),
    );
  }
}

export function getWorkspaceExtensions(workspaceDir: string): Extension[] {
  // If the workspace dir is the user extensions dir, there are no workspace extensions.
  if (path.resolve(workspaceDir) === path.resolve(os.homedir())) {
    return [];
  }
  return loadExtensionsFromDir(workspaceDir);
}

export async function copyExtension(
  source: string,
  destination: string,
): Promise<void> {
  await fs.promises.cp(source, destination, { recursive: true });
}

export async function performWorkspaceExtensionMigration(
  extensions: Extension[],
  requestConsent: (consent: string) => Promise<boolean>,
): Promise<string[]> {
  const failedInstallNames: string[] = [];

  for (const extension of extensions) {
    try {
      const installMetadata: ExtensionInstallMetadata = {
        source: extension.path,
        type: 'local',
      };
      await installExtension(installMetadata, requestConsent);
    } catch (_) {
      failedInstallNames.push(extension.config.name);
    }
  }
  return failedInstallNames;
}

function getTelemetryConfig(cwd: string) {
  const settings = loadSettings(cwd);
  const config = new Config({
    telemetry: settings.merged.telemetry,
    interactive: false,
    sessionId: randomUUID(),
    targetDir: cwd,
    cwd,
    model: '',
    debugMode: false,
  });
  return config;
}

export function loadExtensions(
  extensionEnablementManager: ExtensionEnablementManager,
  workspaceDir: string = process.cwd(),
): Extension[] {
  const settings = loadSettings(workspaceDir).merged;
  const allExtensions = [...loadUserExtensions()];

  if (
    (isWorkspaceTrusted(settings) ?? true) &&
    // Default management setting to true
    !(settings.experimental?.extensionManagement ?? true)
  ) {
    allExtensions.push(...getWorkspaceExtensions(workspaceDir));
  }

  const uniqueExtensions = new Map<string, Extension>();

  for (const extension of allExtensions) {
    if (
      !uniqueExtensions.has(extension.config.name) &&
      extensionEnablementManager.isEnabled(extension.config.name, workspaceDir)
    ) {
      uniqueExtensions.set(extension.config.name, extension);
    }
  }

  return Array.from(uniqueExtensions.values());
}

export function loadUserExtensions(): Extension[] {
  const userExtensions = loadExtensionsFromDir(os.homedir());

  const uniqueExtensions = new Map<string, Extension>();
  for (const extension of userExtensions) {
    if (!uniqueExtensions.has(extension.config.name)) {
      uniqueExtensions.set(extension.config.name, extension);
    }
  }

  return Array.from(uniqueExtensions.values());
}

export function loadExtensionsFromDir(dir: string): Extension[] {
  const storage = new Storage(dir);
  const extensionsDir = storage.getExtensionsDir();
  if (!fs.existsSync(extensionsDir)) {
    return [];
  }

  const extensions: Extension[] = [];
  for (const subdir of fs.readdirSync(extensionsDir)) {
    const extensionDir = path.join(extensionsDir, subdir);

    const extension = loadExtension({ extensionDir, workspaceDir: dir });
    if (extension != null) {
      extensions.push(extension);
    }
  }
  return extensions;
}

export function loadExtension(context: LoadExtensionContext): Extension | null {
  const { extensionDir, workspaceDir } = context;
  if (!fs.statSync(extensionDir).isDirectory()) {
    return null;
  }

  const installMetadata = loadInstallMetadata(extensionDir);
  let effectiveExtensionPath = extensionDir;

  if (installMetadata?.type === 'link') {
    effectiveExtensionPath = installMetadata.source;
  }

  try {
    let config = loadExtensionConfig({
      extensionDir: effectiveExtensionPath,
      workspaceDir,
    });

    config = resolveEnvVarsInObject(config);

    if (config.mcpServers) {
      config.mcpServers = Object.fromEntries(
        Object.entries(config.mcpServers).map(([key, value]) => [
          key,
          filterMcpConfig(value),
        ]),
      );
    }

    const contextFiles = getContextFileNames(config)
      .map((contextFileName) =>
        path.join(effectiveExtensionPath, contextFileName),
      )
      .filter((contextFilePath) => fs.existsSync(contextFilePath));

    return {
      path: effectiveExtensionPath,
      config,
      contextFiles,
      installMetadata,
    };
  } catch (e) {
    console.error(
      `Warning: Skipping extension in ${effectiveExtensionPath}: ${getErrorMessage(
        e,
      )}`,
    );
    return null;
  }
}

export function loadExtensionByName(
  name: string,
  workspaceDir: string = process.cwd(),
): Extension | null {
  const userExtensionsDir = ExtensionStorage.getUserExtensionsDir();
  if (!fs.existsSync(userExtensionsDir)) {
    return null;
  }

  for (const subdir of fs.readdirSync(userExtensionsDir)) {
    const extensionDir = path.join(userExtensionsDir, subdir);
    if (!fs.statSync(extensionDir).isDirectory()) {
      continue;
    }
    const extension = loadExtension({ extensionDir, workspaceDir });
    if (
      extension &&
      extension.config.name.toLowerCase() === name.toLowerCase()
    ) {
      return extension;
    }
  }

  return null;
}

function filterMcpConfig(original: MCPServerConfig): MCPServerConfig {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { trust, ...rest } = original;
  return Object.freeze(rest);
}

export function loadInstallMetadata(
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
 * If enabledExtensionNames is empty, an extension is active unless it is disabled.
 * @param extensions The base list of extensions.
 * @param enabledExtensionNames The names of explicitly enabled extensions.
 * @param workspaceDir The current workspace directory.
 */
export function annotateActiveExtensions(
  extensions: Extension[],
  workspaceDir: string,
  manager: ExtensionEnablementManager,
): GeminiCLIExtension[] {
  manager.validateExtensionOverrides(extensions);
  return extensions.map((extension) => ({
    name: extension.config.name,
    version: extension.config.version,
    isActive: manager.isEnabled(extension.config.name, workspaceDir),
    path: extension.path,
    installMetadata: extension.installMetadata,
  }));
}

/**
 * Requests consent from the user to perform an action, by reading a Y/n
 * character from stdin.
 *
 * This should not be called from interactive mode as it will break the CLI.
 *
 * @param consentDescription The description of the thing they will be consenting to.
 * @returns boolean, whether they consented or not.
 */
export async function requestConsentNonInteractive(
  consentDescription: string,
): Promise<boolean> {
  console.info(consentDescription);
  const result = await promptForConsentNonInteractive(
    'Do you want to continue? [Y/n]: ',
  );
  return result;
}

/**
 * Requests consent from the user to perform an action, in interactive mode.
 *
 * This should not be called from non-interactive mode as it will not work.
 *
 * @param consentDescription The description of the thing they will be consenting to.
 * @param setExtensionUpdateConfirmationRequest A function to actually add a prompt to the UI.
 * @returns boolean, whether they consented or not.
 */
export async function requestConsentInteractive(
  consentDescription: string,
  addExtensionUpdateConfirmationRequest: (value: ConfirmationRequest) => void,
): Promise<boolean> {
  return await promptForConsentInteractive(
    consentDescription + '\n\nDo you want to continue?',
    addExtensionUpdateConfirmationRequest,
  );
}

/**
 * Asks users a prompt and awaits for a y/n response on stdin.
 *
 * This should not be called from interactive mode as it will break the CLI.
 *
 * @param prompt A yes/no prompt to ask the user
 * @returns Whether or not the user answers 'y' (yes). Defaults to 'yes' on enter.
 */
async function promptForConsentNonInteractive(
  prompt: string,
): Promise<boolean> {
  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(['y', ''].includes(answer.trim().toLowerCase()));
    });
  });
}

/**
 * Asks users an interactive yes/no prompt.
 *
 * This should not be called from non-interactive mode as it will break the CLI.
 *
 * @param prompt A markdown prompt to ask the user
 * @param setExtensionUpdateConfirmationRequest Function to update the UI state with the confirmation request.
 * @returns Whether or not the user answers yes.
 */
async function promptForConsentInteractive(
  prompt: string,
  addExtensionUpdateConfirmationRequest: (value: ConfirmationRequest) => void,
): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    addExtensionUpdateConfirmationRequest({
      prompt,
      onConfirm: (resolvedConfirmed) => {
        resolve(resolvedConfirmed);
      },
    });
  });
}

export async function installExtension(
  installMetadata: ExtensionInstallMetadata,
  requestConsent: (consent: string) => Promise<boolean>,
  cwd: string = process.cwd(),
  previousExtensionConfig?: ExtensionConfig,
): Promise<string> {
  const telemetryConfig = getTelemetryConfig(cwd);
  let newExtensionConfig: ExtensionConfig | null = null;
  let localSourcePath: string | undefined;

  try {
    const settings = loadSettings(cwd).merged;
    if (!isWorkspaceTrusted(settings)) {
      throw new Error(
        `Could not install extension from untrusted folder at ${installMetadata.source}`,
      );
    }

    const extensionsDir = ExtensionStorage.getUserExtensionsDir();
    await fs.promises.mkdir(extensionsDir, { recursive: true });

    if (
      !path.isAbsolute(installMetadata.source) &&
      (installMetadata.type === 'local' || installMetadata.type === 'link')
    ) {
      installMetadata.source = path.resolve(cwd, installMetadata.source);
    }

    let tempDir: string | undefined;

    if (
      installMetadata.type === 'git' ||
      installMetadata.type === 'github-release'
    ) {
      tempDir = await ExtensionStorage.createTmpDir();
      try {
        const result = await downloadFromGitHubRelease(
          installMetadata,
          tempDir,
        );
        installMetadata.type = result.type;
        installMetadata.releaseTag = result.tagName;
      } catch (_error) {
        await cloneFromGit(installMetadata, tempDir);
        installMetadata.type = 'git';
      }
      localSourcePath = tempDir;
    } else if (
      installMetadata.type === 'local' ||
      installMetadata.type === 'link'
    ) {
      localSourcePath = installMetadata.source;
    } else {
      throw new Error(`Unsupported install type: ${installMetadata.type}`);
    }

    try {
      newExtensionConfig = loadExtensionConfig({
        extensionDir: localSourcePath,
        workspaceDir: cwd,
      });

      const newExtensionName = newExtensionConfig.name;
      const extensionStorage = new ExtensionStorage(newExtensionName);
      const destinationPath = extensionStorage.getExtensionDir();

      const installedExtensions = loadUserExtensions();
      if (
        installedExtensions.some(
          (installed) => installed.config.name === newExtensionName,
        )
      ) {
        throw new Error(
          `Extension "${newExtensionName}" is already installed. Please uninstall it first.`,
        );
      }
      await maybeRequestConsentOrFail(
        newExtensionConfig,
        requestConsent,
        previousExtensionConfig,
      );
      await fs.promises.mkdir(destinationPath, { recursive: true });

      if (
        installMetadata.type === 'local' ||
        installMetadata.type === 'git' ||
        installMetadata.type === 'github-release'
      ) {
        await copyExtension(localSourcePath, destinationPath);
      }

      const metadataString = JSON.stringify(installMetadata, null, 2);
      const metadataPath = path.join(
        destinationPath,
        INSTALL_METADATA_FILENAME,
      );
      await fs.promises.writeFile(metadataPath, metadataString);
    } finally {
      if (tempDir) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    }

    logExtensionInstallEvent(
      telemetryConfig,
      new ExtensionInstallEvent(
        newExtensionConfig!.name,
        newExtensionConfig!.version,
        installMetadata.source,
        'success',
      ),
    );

    enableExtension(newExtensionConfig!.name, SettingScope.User);
    return newExtensionConfig!.name;
  } catch (error) {
    // Attempt to load config from the source path even if installation fails
    // to get the name and version for logging.
    if (!newExtensionConfig && localSourcePath) {
      try {
        newExtensionConfig = loadExtensionConfig({
          extensionDir: localSourcePath,
          workspaceDir: cwd,
        });
      } catch {
        // Ignore error, this is just for logging.
      }
    }
    logExtensionInstallEvent(
      telemetryConfig,
      new ExtensionInstallEvent(
        newExtensionConfig?.name ?? '',
        newExtensionConfig?.version ?? '',
        installMetadata.source,
        'error',
      ),
    );
    throw error;
  }
}

/**
 * Builds a consent string for installing an extension based on it's
 * extensionConfig.
 */
function extensionConsentString(extensionConfig: ExtensionConfig): string {
  const output: string[] = [];
  const mcpServerEntries = Object.entries(extensionConfig.mcpServers || {});
  output.push(`Installing extension "${extensionConfig.name}".`);
  output.push(
    '**Extensions may introduce unexpected behavior. Ensure you have investigated the extension source and trust the author.**',
  );

  if (mcpServerEntries.length) {
    output.push('This extension will run the following MCP servers:');
    for (const [key, mcpServer] of mcpServerEntries) {
      const isLocal = !!mcpServer.command;
      const source =
        mcpServer.httpUrl ??
        `${mcpServer.command || ''}${mcpServer.args ? ' ' + mcpServer.args.join(' ') : ''}`;
      output.push(`  * ${key} (${isLocal ? 'local' : 'remote'}): ${source}`);
    }
  }
  if (extensionConfig.contextFileName) {
    output.push(
      `This extension will append info to your gemini.md context using ${extensionConfig.contextFileName}`,
    );
  }
  if (extensionConfig.excludeTools) {
    output.push(
      `This extension will exclude the following core tools: ${extensionConfig.excludeTools}`,
    );
  }
  return output.join('\n');
}

/**
 * Requests consent from the user to install an extension (extensionConfig), if
 * there is any difference between the consent string for `extensionConfig` and
 * `previousExtensionConfig`.
 *
 * Always requests consent if previousExtensionConfig is null.
 *
 * Throws if the user does not consent.
 */
async function maybeRequestConsentOrFail(
  extensionConfig: ExtensionConfig,
  requestConsent: (consent: string) => Promise<boolean>,
  previousExtensionConfig?: ExtensionConfig,
) {
  const extensionConsent = extensionConsentString(extensionConfig);
  if (previousExtensionConfig) {
    const previousExtensionConsent = extensionConsentString(
      previousExtensionConfig,
    );
    if (previousExtensionConsent === extensionConsent) {
      return;
    }
  }
  if (!(await requestConsent(extensionConsent))) {
    throw new Error(`Installation cancelled for "${extensionConfig.name}".`);
  }
}

export function validateName(name: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(name)) {
    throw new Error(
      `Invalid extension name: "${name}". Only letters (a-z, A-Z), numbers (0-9), and dashes (-) are allowed.`,
    );
  }
}

export function loadExtensionConfig(
  context: LoadExtensionContext,
): ExtensionConfig {
  const { extensionDir, workspaceDir } = context;
  const configFilePath = path.join(extensionDir, EXTENSIONS_CONFIG_FILENAME);
  if (!fs.existsSync(configFilePath)) {
    throw new Error(`Configuration file not found at ${configFilePath}`);
  }
  try {
    const configContent = fs.readFileSync(configFilePath, 'utf-8');
    const config = recursivelyHydrateStrings(JSON.parse(configContent), {
      extensionPath: extensionDir,
      workspacePath: workspaceDir,
      '/': path.sep,
      pathSeparator: path.sep,
    }) as unknown as ExtensionConfig;
    if (!config.name || !config.version) {
      throw new Error(
        `Invalid configuration in ${configFilePath}: missing ${!config.name ? '"name"' : '"version"'}`,
      );
    }
    validateName(config.name);
    return config;
  } catch (e) {
    throw new Error(
      `Failed to load extension config from ${configFilePath}: ${getErrorMessage(
        e,
      )}`,
    );
  }
}

export async function uninstallExtension(
  extensionIdentifier: string,
  cwd: string = process.cwd(),
): Promise<void> {
  const telemetryConfig = getTelemetryConfig(cwd);
  const installedExtensions = loadUserExtensions();
  const extensionName = installedExtensions.find(
    (installed) =>
      installed.config.name.toLowerCase() ===
        extensionIdentifier.toLowerCase() ||
      installed.installMetadata?.source.toLowerCase() ===
        extensionIdentifier.toLowerCase(),
  )?.config.name;
  if (!extensionName) {
    throw new Error(`Extension not found.`);
  }
  const manager = new ExtensionEnablementManager(
    ExtensionStorage.getUserExtensionsDir(),
    [extensionName],
  );
  manager.remove(extensionName);
  const storage = new ExtensionStorage(extensionName);

  await fs.promises.rm(storage.getExtensionDir(), {
    recursive: true,
    force: true,
  });
  logExtensionUninstall(
    telemetryConfig,
    new ExtensionUninstallEvent(extensionName, 'success'),
  );
}

export function toOutputString(
  extension: Extension,
  workspaceDir: string,
): string {
  const manager = new ExtensionEnablementManager(
    ExtensionStorage.getUserExtensionsDir(),
  );
  const userEnabled = manager.isEnabled(extension.config.name, os.homedir());
  const workspaceEnabled = manager.isEnabled(
    extension.config.name,
    workspaceDir,
  );

  const status = workspaceEnabled ? chalk.green('✓') : chalk.red('✗');
  let output = `${status} ${extension.config.name} (${extension.config.version})`;
  output += `\n Path: ${extension.path}`;
  if (extension.installMetadata) {
    output += `\n Source: ${extension.installMetadata.source} (Type: ${extension.installMetadata.type})`;
    if (extension.installMetadata.ref) {
      output += `\n Ref: ${extension.installMetadata.ref}`;
    }
    if (extension.installMetadata.releaseTag) {
      output += `\n Release tag: ${extension.installMetadata.releaseTag}`;
    }
  }
  output += `\n Enabled (User): ${userEnabled}`;
  output += `\n Enabled (Workspace): ${workspaceEnabled}`;
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

export function disableExtension(
  name: string,
  scope: SettingScope,
  cwd: string = process.cwd(),
) {
  const config = getTelemetryConfig(cwd);
  if (scope === SettingScope.System || scope === SettingScope.SystemDefaults) {
    throw new Error('System and SystemDefaults scopes are not supported.');
  }
  const extension = loadExtensionByName(name, cwd);
  if (!extension) {
    throw new Error(`Extension with name ${name} does not exist.`);
  }

  const manager = new ExtensionEnablementManager(
    ExtensionStorage.getUserExtensionsDir(),
    [name],
  );
  const scopePath = scope === SettingScope.Workspace ? cwd : os.homedir();
  manager.disable(name, true, scopePath);
  logExtensionDisable(config, new ExtensionDisableEvent(name, scope));
}

export function enableExtension(
  name: string,
  scope: SettingScope,
  cwd: string = process.cwd(),
) {
  if (scope === SettingScope.System || scope === SettingScope.SystemDefaults) {
    throw new Error('System and SystemDefaults scopes are not supported.');
  }
  const extension = loadExtensionByName(name, cwd);
  if (!extension) {
    throw new Error(`Extension with name ${name} does not exist.`);
  }
  const manager = new ExtensionEnablementManager(
    ExtensionStorage.getUserExtensionsDir(),
  );
  const scopePath = scope === SettingScope.Workspace ? cwd : os.homedir();
  manager.enable(name, true, scopePath);
  const config = getTelemetryConfig(cwd);
  logExtensionEnable(config, new ExtensionEnableEvent(name, scope));
}
