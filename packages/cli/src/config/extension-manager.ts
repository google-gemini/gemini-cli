/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import chalk from 'chalk';
import { ExtensionEnablementManager } from './extensions/extensionEnablement.js';
import { type Settings, SettingScope } from './settings.js';
import { createHash, randomUUID } from 'node:crypto';
import { loadInstallMetadata, type ExtensionConfig } from './extension.js';
import {
  isWorkspaceTrusted,
  loadTrustedFolders,
  TrustLevel,
} from './trustedFolders.js';
import {
  cloneFromGit,
  downloadFromGitHubRelease,
  tryParseGithubUrl,
} from './extensions/github.js';
import {
  Config,
  debugLogger,
  ExtensionDisableEvent,
  ExtensionEnableEvent,
  ExtensionInstallEvent,
  ExtensionLoader,
  ExtensionUninstallEvent,
  ExtensionUpdateEvent,
  getErrorMessage,
  logExtensionDisable,
  logExtensionEnable,
  logExtensionInstallEvent,
  logExtensionUninstall,
  logExtensionUpdateEvent,
  type ExtensionEvents,
  type MCPServerConfig,
  type ExtensionInstallMetadata,
  type GeminiCLIExtension,
} from '@google/gemini-cli-core';
import { maybeRequestConsentOrFail } from './extensions/consent.js';
import { resolveEnvVarsInObject } from '../utils/envVarResolver.js';
import { ExtensionStorage } from './extensions/storage.js';
import {
  EXTENSIONS_CONFIG_FILENAME,
  INSTALL_METADATA_FILENAME,
  recursivelyHydrateStrings,
  type JsonObject,
} from './extensions/variables.js';
import {
  getEnvContents,
  maybePromptForSettings,
  type ExtensionSetting,
} from './extensions/extensionSettings.js';
import type { EventEmitter } from 'node:stream';

interface ExtensionManagerParams {
  enabledExtensionOverrides?: string[];
  settings: Settings;
  requestConsent: (consent: string) => Promise<boolean>;
  requestSetting: ((setting: ExtensionSetting) => Promise<string>) | null;
  workspaceDir: string;
  eventEmitter?: EventEmitter<ExtensionEvents>;
}

/**
 * Actual implementation of an ExtensionLoader.
 *
 * You must call `loadExtensions` prior to calling other methods on this class.
 */
export class ExtensionManager extends ExtensionLoader {
  private extensionEnablementManager: ExtensionEnablementManager;
  private settings: Settings;
  private requestConsent: (consent: string) => Promise<boolean>;
  private requestSetting:
    | ((setting: ExtensionSetting) => Promise<string>)
    | undefined;
  private telemetryConfig: Config;
  private workspaceDir: string;
  private loadedExtensions: GeminiCLIExtension[] | undefined;

  constructor(options: ExtensionManagerParams) {
    super(options.eventEmitter);
    this.workspaceDir = options.workspaceDir;
    this.extensionEnablementManager = new ExtensionEnablementManager(
      options.enabledExtensionOverrides,
    );
    this.settings = options.settings;
    this.telemetryConfig = new Config({
      telemetry: options.settings.telemetry,
      interactive: false,
      sessionId: randomUUID(),
      targetDir: options.workspaceDir,
      cwd: options.workspaceDir,
      model: '',
      debugMode: false,
    });
    this.requestConsent = options.requestConsent;
    this.requestSetting = options.requestSetting ?? undefined;
  }

  setRequestConsent(
    requestConsent: (consent: string) => Promise<boolean>,
  ): void {
    this.requestConsent = requestConsent;
  }

  setRequestSetting(
    requestSetting?: (setting: ExtensionSetting) => Promise<string>,
  ): void {
    this.requestSetting = requestSetting;
  }

  getExtensions(): GeminiCLIExtension[] {
    if (!this.loadedExtensions) {
      throw new Error(
        'Extensions not yet loaded, must call `loadExtensions` first',
      );
    }
    return this.loadedExtensions!;
  }

  async installOrUpdateExtension(
    installMetadata: ExtensionInstallMetadata,
    previousExtensionConfig?: ExtensionConfig,
  ): Promise<GeminiCLIExtension> {
    const isUpdate = !!previousExtensionConfig;
    let newExtensionConfig: ExtensionConfig | null = null;
    let localSourcePath: string | undefined;
    let extension: GeminiCLIExtension | null;
    try {
      if (!isWorkspaceTrusted(this.settings).isTrusted) {
        if (
          await this.requestConsent(
            `The current workspace at "${this.workspaceDir}" is not trusted. Do you want to trust this workspace to install extensions?`,
          )
        ) {
          const trustedFolders = loadTrustedFolders();
          trustedFolders.setValue(this.workspaceDir, TrustLevel.TRUST_FOLDER);
        } else {
          throw new Error(
            `Could not install extension because the current workspace at ${this.workspaceDir} is not trusted.`,
          );
        }
      }
      const extensionsDir = ExtensionStorage.getUserExtensionsDir();
      await fs.promises.mkdir(extensionsDir, { recursive: true });

      if (
        !path.isAbsolute(installMetadata.source) &&
        (installMetadata.type === 'local' || installMetadata.type === 'link')
      ) {
        installMetadata.source = path.resolve(
          this.workspaceDir,
          installMetadata.source,
        );
      }

      let tempDir: string | undefined;

      if (
        installMetadata.type === 'git' ||
        installMetadata.type === 'github-release'
      ) {
        tempDir = await ExtensionStorage.createTmpDir();
        const parsedGithubParts = tryParseGithubUrl(installMetadata.source);
        if (!parsedGithubParts) {
          await cloneFromGit(installMetadata, tempDir);
          installMetadata.type = 'git';
        } else {
          const result = await downloadFromGitHubRelease(
            installMetadata,
            tempDir,
            parsedGithubParts,
          );
          if (result.success) {
            installMetadata.type = result.type;
            installMetadata.releaseTag = result.tagName;
          } else if (
            // This repo has no github releases, and wasn't explicitly installed
            // from a github release, unconditionally just clone it.
            (result.failureReason === 'no release data' &&
              installMetadata.type === 'git') ||
            // Otherwise ask the user if they would like to try a git clone.
            (await this.requestConsent(
              `Error downloading github release for ${installMetadata.source} with the following error: ${result.errorMessage}.\n\nWould you like to attempt to install via "git clone" instead?`,
            ))
          ) {
            await cloneFromGit(installMetadata, tempDir);
            installMetadata.type = 'git';
          } else {
            throw new Error(
              `Failed to install extension ${installMetadata.source}: ${result.errorMessage}`,
            );
          }
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
        newExtensionConfig = this.loadExtensionConfig(localSourcePath);

        if (isUpdate && installMetadata.autoUpdate) {
          const oldSettings = new Set(
            previousExtensionConfig.settings?.map((s) => s.name) || [],
          );
          const newSettings = new Set(
            newExtensionConfig.settings?.map((s) => s.name) || [],
          );

          const settingsAreEqual =
            oldSettings.size === newSettings.size &&
            [...oldSettings].every((value) => newSettings.has(value));

          if (!settingsAreEqual && installMetadata.autoUpdate) {
            throw new Error(
              `Extension "${newExtensionConfig.name}" has settings changes and cannot be auto-updated. Please update manually.`,
            );
          }
        }

        const newExtensionName = newExtensionConfig.name;
        const previous = this.getExtensions().find(
          (installed) => installed.name === newExtensionName,
        );
        if (isUpdate && !previous) {
          throw new Error(
            `Extension "${newExtensionName}" was not already installed, cannot update it.`,
          );
        } else if (!isUpdate && previous) {
          throw new Error(
            `Extension "${newExtensionName}" is already installed. Please uninstall it first.`,
          );
        }

        await maybeRequestConsentOrFail(
          newExtensionConfig,
          this.requestConsent,
          previousExtensionConfig,
        );
        const extensionId = getExtensionId(newExtensionConfig, installMetadata);
        const destinationPath = new ExtensionStorage(
          newExtensionName,
        ).getExtensionDir();
        let previousSettings: Record<string, string> | undefined;
        if (isUpdate) {
          previousSettings = await getEnvContents(
            previousExtensionConfig,
            extensionId,
          );
          await this.uninstallExtension(newExtensionName, isUpdate);
        }

        await fs.promises.mkdir(destinationPath, { recursive: true });
        if (this.requestSetting) {
          if (isUpdate) {
            await maybePromptForSettings(
              newExtensionConfig,
              extensionId,
              this.requestSetting,
              previousExtensionConfig,
              previousSettings,
            );
          } else {
            await maybePromptForSettings(
              newExtensionConfig,
              extensionId,
              this.requestSetting,
            );
          }
        }

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

        // TODO: Gracefully handle this call failing, we should back up the old
        // extension prior to overwriting it and then restore and restart it.
        extension = await this.loadExtension(destinationPath)!;
        if (!extension) {
          throw new Error(`Extension not found`);
        }
        if (isUpdate) {
          logExtensionUpdateEvent(
            this.telemetryConfig,
            new ExtensionUpdateEvent(
              hashValue(newExtensionConfig.name),
              getExtensionId(newExtensionConfig, installMetadata),
              newExtensionConfig.version,
              previousExtensionConfig.version,
              installMetadata.type,
              'success',
            ),
          );
        } else {
          logExtensionInstallEvent(
            this.telemetryConfig,
            new ExtensionInstallEvent(
              hashValue(newExtensionConfig.name),
              getExtensionId(newExtensionConfig, installMetadata),
              newExtensionConfig.version,
              installMetadata.type,
              'success',
            ),
          );
          this.enableExtension(newExtensionConfig.name, SettingScope.User);
        }
      } finally {
        if (tempDir) {
          await fs.promises.rm(tempDir, { recursive: true, force: true });
        }
      }
      return extension;
    } catch (error) {
      // Attempt to load config from the source path even if installation fails
      // to get the name and version for logging.
      if (!newExtensionConfig && localSourcePath) {
        try {
          newExtensionConfig = this.loadExtensionConfig(localSourcePath);
        } catch {
          // Ignore error, this is just for logging.
        }
      }
      const config = newExtensionConfig ?? previousExtensionConfig;
      const extensionId = config
        ? getExtensionId(config, installMetadata)
        : undefined;
      if (isUpdate) {
        logExtensionUpdateEvent(
          this.telemetryConfig,
          new ExtensionUpdateEvent(
            hashValue(config?.name ?? ''),
            extensionId ?? '',
            newExtensionConfig?.version ?? '',
            previousExtensionConfig.version,
            installMetadata.type,
            'error',
          ),
        );
      } else {
        logExtensionInstallEvent(
          this.telemetryConfig,
          new ExtensionInstallEvent(
            hashValue(newExtensionConfig?.name ?? ''),
            extensionId ?? '',
            newExtensionConfig?.version ?? '',
            installMetadata.type,
            'error',
          ),
        );
      }
      throw error;
    }
  }

  async uninstallExtension(
    extensionIdentifier: string,
    isUpdate: boolean,
  ): Promise<void> {
    const installedExtensions = this.getExtensions();
    const extension = installedExtensions.find(
      (installed) =>
        installed.name.toLowerCase() === extensionIdentifier.toLowerCase() ||
        installed.installMetadata?.source.toLowerCase() ===
          extensionIdentifier.toLowerCase(),
    );
    if (!extension) {
      throw new Error(`Extension not found.`);
    }
    await this.unloadExtension(extension);
    const storage = new ExtensionStorage(extension.name);

    await fs.promises.rm(storage.getExtensionDir(), {
      recursive: true,
      force: true,
    });

    // The rest of the cleanup below here is only for true uninstalls, not
    // uninstalls related to updates.
    if (isUpdate) return;

    this.extensionEnablementManager.remove(extension.name);

    logExtensionUninstall(
      this.telemetryConfig,
      new ExtensionUninstallEvent(
        hashValue(extension.name),
        extension.id,
        'success',
      ),
    );
  }

  /**
   * Loads all installed extensions, should only be called once.
   */
  async loadExtensions(): Promise<GeminiCLIExtension[]> {
    if (this.loadedExtensions) {
      throw new Error('Extensions already loaded, only load extensions once.');
    }
    const extensionsDir = ExtensionStorage.getUserExtensionsDir();
    this.loadedExtensions = [];
    if (!fs.existsSync(extensionsDir)) {
      return this.loadedExtensions;
    }
    for (const subdir of fs.readdirSync(extensionsDir)) {
      const extensionDir = path.join(extensionsDir, subdir);
      await this.loadExtension(extensionDir);
    }
    return this.loadedExtensions;
  }

  /**
   * Adds `extension` to the list of extensions and starts it if appropriate.
   */
  private async loadExtension(
    extensionDir: string,
  ): Promise<GeminiCLIExtension | null> {
    this.loadedExtensions ??= [];
    if (!fs.statSync(extensionDir).isDirectory()) {
      return null;
    }

    const installMetadata = loadInstallMetadata(extensionDir);
    let effectiveExtensionPath = extensionDir;

    if (installMetadata?.type === 'link') {
      effectiveExtensionPath = installMetadata.source;
    }

    try {
      let config = this.loadExtensionConfig(effectiveExtensionPath);
      if (
        this.getExtensions().find((extension) => extension.name === config.name)
      ) {
        throw new Error(
          `Extension with name ${config.name} already was loaded.`,
        );
      }

      const customEnv = await getEnvContents(
        config,
        getExtensionId(config, installMetadata),
      );
      config = resolveEnvVarsInObject(config, customEnv);

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

      const extension = {
        name: config.name,
        version: config.version,
        path: effectiveExtensionPath,
        contextFiles,
        installMetadata,
        mcpServers: config.mcpServers,
        excludeTools: config.excludeTools,
        isActive: this.extensionEnablementManager.isEnabled(
          config.name,
          this.workspaceDir,
        ),
        id: getExtensionId(config, installMetadata),
      };
      this.loadedExtensions = [...this.loadedExtensions, extension];

      await this.maybeStartExtension(extension);
      return extension;
    } catch (e) {
      debugLogger.error(
        `Warning: Skipping extension in ${effectiveExtensionPath}: ${getErrorMessage(
          e,
        )}`,
      );
      return null;
    }
  }

  /**
   * Removes `extension` from the list of extensions and stops it if
   * appropriate.
   */
  private unloadExtension(
    extension: GeminiCLIExtension,
  ): Promise<void> | undefined {
    this.loadedExtensions = this.getExtensions().filter(
      (entry) => extension !== entry,
    );
    return this.maybeStopExtension(extension);
  }

  loadExtensionConfig(extensionDir: string): ExtensionConfig {
    const configFilePath = path.join(extensionDir, EXTENSIONS_CONFIG_FILENAME);
    if (!fs.existsSync(configFilePath)) {
      throw new Error(`Configuration file not found at ${configFilePath}`);
    }
    try {
      const configContent = fs.readFileSync(configFilePath, 'utf-8');
      const rawConfig = JSON.parse(configContent) as ExtensionConfig;
      if (!rawConfig.name || !rawConfig.version) {
        throw new Error(
          `Invalid configuration in ${configFilePath}: missing ${!rawConfig.name ? '"name"' : '"version"'}`,
        );
      }
      const config = recursivelyHydrateStrings(
        rawConfig as unknown as JsonObject,
        {
          extensionPath: extensionDir,
          workspacePath: this.workspaceDir,
          '/': path.sep,
          pathSeparator: path.sep,
        },
      ) as unknown as ExtensionConfig;

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

  toOutputString(extension: GeminiCLIExtension): string {
    const userEnabled = this.extensionEnablementManager.isEnabled(
      extension.name,
      os.homedir(),
    );
    const workspaceEnabled = this.extensionEnablementManager.isEnabled(
      extension.name,
      this.workspaceDir,
    );

    const status = workspaceEnabled ? chalk.green('✓') : chalk.red('✗');
    let output = `${status} ${extension.name} (${extension.version})`;
    output += `\n ID: ${extension.id}`;
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
    if (extension.mcpServers) {
      output += `\n MCP servers:`;
      Object.keys(extension.mcpServers).forEach((key) => {
        output += `\n  ${key}`;
      });
    }
    if (extension.excludeTools) {
      output += `\n Excluded tools:`;
      extension.excludeTools.forEach((tool) => {
        output += `\n  ${tool}`;
      });
    }
    return output;
  }

  async disableExtension(name: string, scope: SettingScope) {
    if (
      scope === SettingScope.System ||
      scope === SettingScope.SystemDefaults
    ) {
      throw new Error('System and SystemDefaults scopes are not supported.');
    }
    const extension = this.getExtensions().find(
      (extension) => extension.name === name,
    );
    if (!extension) {
      throw new Error(`Extension with name ${name} does not exist.`);
    }

    if (scope !== SettingScope.Session) {
      const scopePath =
        scope === SettingScope.Workspace ? this.workspaceDir : os.homedir();
      this.extensionEnablementManager.disable(name, true, scopePath);
    }
    logExtensionDisable(
      this.telemetryConfig,
      new ExtensionDisableEvent(hashValue(name), extension.id, scope),
    );
    if (!this.config || this.config.getEnableExtensionReloading()) {
      // Only toggle the isActive state if we are actually going to disable it
      // in the current session, or we haven't been initialized yet.
      extension.isActive = false;
    }
    await this.maybeStopExtension(extension);
  }

  /**
   * Enables an existing extension for a given scope, and starts it if
   * appropriate.
   */
  async enableExtension(name: string, scope: SettingScope) {
    if (
      scope === SettingScope.System ||
      scope === SettingScope.SystemDefaults
    ) {
      throw new Error('System and SystemDefaults scopes are not supported.');
    }
    const extension = this.getExtensions().find(
      (extension) => extension.name === name,
    );
    if (!extension) {
      throw new Error(`Extension with name ${name} does not exist.`);
    }

    if (scope !== SettingScope.Session) {
      const scopePath =
        scope === SettingScope.Workspace ? this.workspaceDir : os.homedir();
      this.extensionEnablementManager.enable(name, true, scopePath);
    }
    logExtensionEnable(
      this.telemetryConfig,
      new ExtensionEnableEvent(hashValue(name), extension.id, scope),
    );
    if (!this.config || this.config.getEnableExtensionReloading()) {
      // Only toggle the isActive state if we are actually going to disable it
      // in the current session, or we haven't been initialized yet.
      extension.isActive = true;
    }
    await this.maybeStartExtension(extension);
  }
}

function filterMcpConfig(original: MCPServerConfig): MCPServerConfig {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { trust, ...rest } = original;
  return Object.freeze(rest);
}

export async function copyExtension(
  source: string,
  destination: string,
): Promise<void> {
  await fs.promises.cp(source, destination, { recursive: true });
}

function getContextFileNames(config: ExtensionConfig): string[] {
  if (!config.contextFileName) {
    return ['GEMINI.md'];
  } else if (!Array.isArray(config.contextFileName)) {
    return [config.contextFileName];
  }
  return config.contextFileName;
}

function validateName(name: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(name)) {
    throw new Error(
      `Invalid extension name: "${name}". Only letters (a-z, A-Z), numbers (0-9), and dashes (-) are allowed.`,
    );
  }
}

export function getExtensionId(
  config: ExtensionConfig,
  installMetadata?: ExtensionInstallMetadata,
): string {
  // IDs are created by hashing details of the installation source in order to
  // deduplicate extensions with conflicting names and also obfuscate any
  // potentially sensitive information such as private git urls, system paths,
  // or project names.
  let idValue = config.name;
  const githubUrlParts =
    installMetadata &&
    (installMetadata.type === 'git' ||
      installMetadata.type === 'github-release')
      ? tryParseGithubUrl(installMetadata.source)
      : null;
  if (githubUrlParts) {
    // For github repos, we use the https URI to the repo as the ID.
    idValue = `https://github.com/${githubUrlParts.owner}/${githubUrlParts.repo}`;
  } else {
    idValue = installMetadata?.source ?? config.name;
  }
  return hashValue(idValue);
}

export function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
