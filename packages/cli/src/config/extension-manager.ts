/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { stat } from 'node:fs/promises';
import chalk from 'chalk';
import { ExtensionEnablementManager } from './extensions/extensionEnablement.js';
import { type MergedSettings, SettingScope } from './settings.js';
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
  loadSkillsFromDir,
  loadAgentsFromDirectory,
  homedir,
  type ExtensionEvents,
  type MCPServerConfig,
  type ExtensionInstallMetadata,
  type GeminiCLIExtension,
  type HookDefinition,
  type HookEventName,
  type ResolvedExtensionSetting,
  coreEvents,
  applyAdminAllowlist,
  getAdminBlockedMcpServersMessage,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';
import { maybeRequestConsentOrFail } from './extensions/consent.js';
import { resolveEnvVarsInObject } from '../utils/envVarResolver.js';
import { ExtensionStorage } from './extensions/storage.js';
import { removeDirectoryWithRetry } from '../utils/retry.js';
import {
  EXTENSIONS_CONFIG_FILENAME,
  INSTALL_METADATA_FILENAME,
  recursivelyHydrateStrings,
  type JsonObject,
  type VariableContext,
} from './extensions/variables.js';
import {
  getEnvContents,
  getEnvFilePath,
  maybePromptForSettings,
  getMissingSettings,
  type ExtensionSetting,
  getScopedEnvContents,
  ExtensionSettingScope,
} from './extensions/extensionSettings.js';
import type { EventEmitter } from 'node:stream';
import { themeManager } from '../ui/themes/theme-manager.js';
import { getFormattedSettingValue } from '../commands/extensions/utils.js';

interface ExtensionManagerParams {
  enabledExtensionOverrides?: string[];
  settings: MergedSettings;
  requestConsent: (consent: string) => Promise<boolean>;
  requestSetting: ((setting: ExtensionSetting) => Promise<string>) | null;
  workspaceDir: string;
  eventEmitter?: EventEmitter<ExtensionEvents>;
  clientVersion?: string;
}

/**
 * Actual implementation of an ExtensionLoader.
 *
 * You must call `loadExtensions` prior to calling other methods on this class.
 */
export class ExtensionManager extends ExtensionLoader {
  private extensionEnablementManager: ExtensionEnablementManager;
  private settings: MergedSettings;
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
      clientVersion: options.clientVersion ?? 'unknown',
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
    return this.loadedExtensions;
  }

  async installOrUpdateExtension(
    installMetadata: ExtensionInstallMetadata,
    previousExtensionConfig?: ExtensionConfig,
  ): Promise<GeminiCLIExtension> {
    if (
      this.settings.security?.allowedExtensions &&
      this.settings.security?.allowedExtensions.length > 0
    ) {
      const extensionAllowed = this.settings.security?.allowedExtensions.some(
        (pattern) => {
          try {
            return new RegExp(pattern).test(installMetadata.source);
          } catch (e) {
            throw new Error(
              `Invalid regex pattern in allowedExtensions setting: "${pattern}. Error: ${getErrorMessage(e)}`,
            );
          }
        },
      );
      if (!extensionAllowed) {
        throw new Error(
          `Installing extension from source "${installMetadata.source}" is not allowed by the "allowedExtensions" security setting.`,
        );
      }
    } else if (
      (installMetadata.type === 'git' ||
        installMetadata.type === 'github-release') &&
      this.settings.security.blockGitExtensions
    ) {
      throw new Error(
        'Installing extensions from remote sources is disallowed by your current settings.',
      );
    }

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
          await trustedFolders.setValue(
            this.workspaceDir,
            TrustLevel.TRUST_FOLDER,
          );
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
              `Error downloading github release for ${installMetadata.source} with the following error: ${result.errorMessage}.

Would you like to attempt to install via "git clone" instead?`,
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
        newExtensionConfig = await this.loadExtensionConfig(localSourcePath);

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

        const newHasHooks = fs.existsSync(
          path.join(localSourcePath, 'hooks', 'hooks.json'),
        );
        const previousHasHooks = !!(
          isUpdate &&
          previous &&
          previous.hooks &&
          Object.keys(previous.hooks).length > 0
        );

        const newSkills = await loadSkillsFromDir(
          path.join(localSourcePath, 'skills'),
        );
        const previousSkills = previous?.skills ?? [];

        await maybeRequestConsentOrFail(
          newExtensionConfig,
          this.requestConsent,
          newHasHooks,
          previousExtensionConfig,
          previousHasHooks,
          newSkills,
          previousSkills,
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
            this.workspaceDir,
          );
          await this.uninstallExtension(newExtensionName, isUpdate);
        }

        await fs.promises.mkdir(destinationPath, { recursive: true });
        if (this.requestSetting && this.settings.experimental.extensionConfig) {
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

        const missingSettings = this.settings.experimental.extensionConfig
          ? await getMissingSettings(
              newExtensionConfig,
              extensionId,
              this.workspaceDir,
            )
          : [];
        if (missingSettings.length > 0) {
          const message = `Extension "${newExtensionConfig.name}" has missing settings: ${missingSettings
            .map((s) => s.name)
            .join(
              ', ',
            )}. Please run "gemini extensions config ${newExtensionConfig.name} [setting-name]" to configure them.`;
          debugLogger.warn(message);
          coreEvents.emitFeedback('warning', message);
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
        extension = await this.loadExtension(destinationPath);
        if (!extension) {
          throw new Error(`Extension not found`);
        }
        if (isUpdate) {
          await logExtensionUpdateEvent(
            this.telemetryConfig,
            new ExtensionUpdateEvent(
              newExtensionConfig.name,
              hashValue(newExtensionConfig.name),
              getExtensionId(newExtensionConfig, installMetadata),
              newExtensionConfig.version,
              previousExtensionConfig.version,
              installMetadata.type,
              CoreToolCallStatus.Success,
            ),
          );
        } else {
          await logExtensionInstallEvent(
            this.telemetryConfig,
            new ExtensionInstallEvent(
              newExtensionConfig.name,
              hashValue(newExtensionConfig.name),
              getExtensionId(newExtensionConfig, installMetadata),
              newExtensionConfig.version,
              installMetadata.type,
              CoreToolCallStatus.Success,
            ),
          );
          await this.enableExtension(
            newExtensionConfig.name,
            SettingScope.User,
          );
        }
      } finally {
        if (tempDir) {
          await removeDirectoryWithRetry(tempDir);
        }
      }
      return extension;
    } catch (error) {
      // Attempt to load config from the source path even if installation fails
      // to get the name and version for logging.
      if (!newExtensionConfig && localSourcePath) {
        try {
          newExtensionConfig = await this.loadExtensionConfig(localSourcePath);
        } catch {
          // Ignore error, this is just for logging.
        }
      }
      const config = newExtensionConfig ?? previousExtensionConfig;
      const extensionId = config
        ? getExtensionId(config, installMetadata)
        : undefined;
      if (isUpdate) {
        await logExtensionUpdateEvent(
          this.telemetryConfig,
          new ExtensionUpdateEvent(
            config?.name ?? '',
            hashValue(config?.name ?? ''),
            extensionId ?? '',
            newExtensionConfig?.version ?? '',
            previousExtensionConfig.version,
            installMetadata.type,
            CoreToolCallStatus.Error,
          ),
        );
      } else {
        await logExtensionInstallEvent(
          this.telemetryConfig,
          new ExtensionInstallEvent(
            newExtensionConfig?.name ?? '',
            hashValue(newExtensionConfig?.name ?? ''),
            extensionId ?? '',
            newExtensionConfig?.version ?? '',
            installMetadata.type,
            CoreToolCallStatus.Error,
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
    const storage = new ExtensionStorage(
      extension.installMetadata?.type === 'link'
        ? extension.name
        : path.basename(extension.path),
    );

    await removeDirectoryWithRetry(storage.getExtensionDir());

    // The rest of the cleanup below here is only for true uninstalls, not
    // uninstalls related to updates.
    if (isUpdate) return;

    this.extensionEnablementManager.remove(extension.name);

    await logExtensionUninstall(
      this.telemetryConfig,
      new ExtensionUninstallEvent(
        extension.name,
        hashValue(extension.name),
        extension.id,
        CoreToolCallStatus.Success,
      ),
    );
  }

  protected override async startExtension(extension: GeminiCLIExtension) {
    await super.startExtension(extension);
    if (extension.themes) {
      themeManager.registerExtensionThemes(extension.name, extension.themes);
    }
  }

  protected override async stopExtension(extension: GeminiCLIExtension) {
    await super.stopExtension(extension);
    if (extension.themes) {
      themeManager.unregisterExtensionThemes(extension.name, extension.themes);
    }
  }

  /**
   * Loads all installed extensions, should only be called once.
   */
  async loadExtensions(): Promise<GeminiCLIExtension[]> {
    if (this.loadedExtensions) {
      throw new Error('Extensions already loaded, only load extensions once.');
    }

    if (this.settings.admin.extensions.enabled === false) {
      this.loadedExtensions = [];
      return this.loadedExtensions;
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
    if (
      this.settings.security?.allowedExtensions &&
      this.settings.security?.allowedExtensions.length > 0
    ) {
      if (!installMetadata?.source) {
        throw new Error(
          `Failed to load extension ${extensionDir}. The ${INSTALL_METADATA_FILENAME} file is missing or misconfigured.`,
        );
      }
      const extensionAllowed = this.settings.security?.allowedExtensions.some(
        (pattern) => {
          try {
            return new RegExp(pattern).test(installMetadata?.source);
          } catch (e) {
            throw new Error(
              `Invalid regex pattern in allowedExtensions setting: "${pattern}. Error: ${getErrorMessage(e)}`,
            );
          }
        },
      );
      if (!extensionAllowed) {
        debugLogger.warn(
          `Failed to load extension ${extensionDir}. This extension is not allowed by the "allowedExtensions" security setting.`,
        );
        return null;
      }
    } else if (
      (installMetadata?.type === 'git' ||
        installMetadata?.type === 'github-release') &&
      this.settings.security.blockGitExtensions
    ) {
      debugLogger.warn(
        `Failed to load extension ${extensionDir}. Extensions from remote sources is disallowed by your current settings.`,
      );
      return null;
    }

    if (installMetadata?.type === 'link') {
      effectiveExtensionPath = installMetadata.source;
    }

    try {
      let config = await this.loadExtensionConfig(effectiveExtensionPath);
      if (
        this.getExtensions().find((extension) => extension.name === config.name)
      ) {
        throw new Error(
          `Extension with name ${config.name} already was loaded.`,
        );
      }

      const extensionId = getExtensionId(config, installMetadata);

      let userSettings: Record<string, string> = {};
      let workspaceSettings: Record<string, string> = {};

      if (this.settings.experimental.extensionConfig) {
        userSettings = await getScopedEnvContents(
          config,
          extensionId,
          ExtensionSettingScope.USER,
        );
        if (isWorkspaceTrusted(this.settings).isTrusted) {
          workspaceSettings = await getScopedEnvContents(
            config,
            extensionId,
            ExtensionSettingScope.WORKSPACE,
            this.workspaceDir,
          );
        }
      }

      const customEnv = { ...userSettings, ...workspaceSettings };
      config = resolveEnvVarsInObject(config, customEnv);

      const resolvedSettings: ResolvedExtensionSetting[] = [];
      if (config.settings && this.settings.experimental.extensionConfig) {
        for (const setting of config.settings) {
          const value = customEnv[setting.envVar];
          let scope: 'user' | 'workspace' | undefined;
          let source: string | undefined;

          // Note: strict check for undefined, as empty string is a valid value
          if (workspaceSettings[setting.envVar] !== undefined) {
            scope = 'workspace';
            if (setting.sensitive) {
              source = 'Keychain';
            } else {
              source = getEnvFilePath(
                config.name,
                ExtensionSettingScope.WORKSPACE,
                this.workspaceDir,
              );
            }
          } else if (userSettings[setting.envVar] !== undefined) {
            scope = 'user';
            if (setting.sensitive) {
              source = 'Keychain';
            } else {
              source = getEnvFilePath(config.name, ExtensionSettingScope.USER);
            }
          }

          resolvedSettings.push({
            name: setting.name,
            envVar: setting.envVar,
            value,
            sensitive: setting.sensitive ?? false,
            scope,
            source,
          });
        }
      }

      if (config.mcpServers) {
        if (this.settings.admin.mcp.enabled === false) {
          config.mcpServers = undefined;
        } else {
          // Apply admin allowlist if configured
          const adminAllowlist = this.settings.admin.mcp.config;
          if (adminAllowlist && Object.keys(adminAllowlist).length > 0) {
            const result = applyAdminAllowlist(
              config.mcpServers,
              adminAllowlist,
            );
            config.mcpServers = result.mcpServers;

            if (result.blockedServerNames.length > 0) {
              const message = getAdminBlockedMcpServersMessage(
                result.blockedServerNames,
                undefined,
              );
              coreEvents.emitConsoleLog('warn', message);
            }
          }

          // Then apply local filtering/sanitization
          if (config.mcpServers) {
            config.mcpServers = Object.fromEntries(
              Object.entries(config.mcpServers).map(([key, value]) => [
                key,
                filterMcpConfig(value),
              ]),
            );
          }
        }
      }

      const contextFiles = getContextFileNames(config)
        .map((contextFileName) =>
          path.join(effectiveExtensionPath, contextFileName),
        )
        .filter((contextFilePath) => fs.existsSync(contextFilePath));

      const hydrationContext: VariableContext = {
        extensionPath: effectiveExtensionPath,
        workspacePath: this.workspaceDir,
        '/': path.sep,
        pathSeparator: path.sep,
        ...customEnv,
      };

      let hooks: { [K in HookEventName]?: HookDefinition[] } | undefined;
      if (this.settings.hooksConfig.enabled) {
        hooks = await this.loadExtensionHooks(
          effectiveExtensionPath,
          hydrationContext,
        );
      }

      // Hydrate hooks with extension settings as environment variables
      if (hooks && config.settings) {
        const hookEnv: Record<string, string> = {};
        for (const setting of config.settings) {
          const value = customEnv[setting.envVar];
          if (value !== undefined) {
            hookEnv[setting.envVar] = value;
          }
        }

        if (Object.keys(hookEnv).length > 0) {
          for (const eventName of Object.keys(hooks)) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const eventHooks = hooks[eventName as HookEventName];
            if (eventHooks) {
              for (const definition of eventHooks) {
                for (const hook of definition.hooks) {
                  // Merge existing env with new env vars, giving extension settings precedence.
                  hook.env = { ...hook.env, ...hookEnv };
                }
              }
            }
          }
        }
      }

      let skills = await loadSkillsFromDir(
        path.join(effectiveExtensionPath, 'skills'),
      );
      skills = skills.map((skill) =>
        recursivelyHydrateStrings(skill, hydrationContext),
      );

      const agentLoadResult = await loadAgentsFromDirectory(
        path.join(effectiveExtensionPath, 'agents'),
      );
      agentLoadResult.agents = agentLoadResult.agents.map((agent) =>
        recursivelyHydrateStrings(agent, hydrationContext),
      );

      // Log errors but don't fail the entire extension load
      for (const error of agentLoadResult.errors) {
        debugLogger.warn(
          `[ExtensionManager] Error loading agent from ${config.name}: ${error.message}`,
        );
      }

      const extension: GeminiCLIExtension = {
        name: config.name,
        version: config.version,
        path: effectiveExtensionPath,
        contextFiles,
        installMetadata,
        mcpServers: config.mcpServers,
        excludeTools: config.excludeTools,
        hooks,
        isActive: this.extensionEnablementManager.isEnabled(
          config.name,
          this.workspaceDir,
        ),
        id: getExtensionId(config, installMetadata),
        settings: config.settings,
        resolvedSettings,
        skills,
        agents: agentLoadResult.agents,
        themes: config.themes,
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

  override async restartExtension(
    extension: GeminiCLIExtension,
  ): Promise<void> {
    const extensionDir = extension.path;
    await this.unloadExtension(extension);
    await this.loadExtension(extensionDir);
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

  async loadExtensionConfig(extensionDir: string): Promise<ExtensionConfig> {
    const configFilePath = path.join(extensionDir, EXTENSIONS_CONFIG_FILENAME);
    if (!fs.existsSync(configFilePath)) {
      throw new Error(`Configuration file not found at ${configFilePath}`);
    }
    try {
      const configContent = await fs.promises.readFile(configFilePath, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const rawConfig = JSON.parse(configContent) as ExtensionConfig;
      if (!rawConfig.name || !rawConfig.version) {
        throw new Error(
          `Invalid configuration in ${configFilePath}: missing ${!rawConfig.name ? '"name"' : '"version"'}`,
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const config = recursivelyHydrateStrings(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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

  private async loadExtensionHooks(
    extensionDir: string,
    context: VariableContext,
  ): Promise<{ [K in HookEventName]?: HookDefinition[] } | undefined> {
    const hooksFilePath = path.join(extensionDir, 'hooks', 'hooks.json');

    try {
      const hooksContent = await fs.promises.readFile(hooksFilePath, 'utf-8');
      const rawHooks = JSON.parse(hooksContent);

      if (
        !rawHooks ||
        typeof rawHooks !== 'object' ||
        typeof rawHooks.hooks !== 'object' ||
        rawHooks.hooks === null ||
        Array.isArray(rawHooks.hooks)
      ) {
        debugLogger.warn(
          `Invalid hooks configuration in ${hooksFilePath}: "hooks" property must be an object`,
        );
        return undefined;
      }

      // Hydrate variables in the hooks configuration
      const hydratedHooks = recursivelyHydrateStrings(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        rawHooks.hooks as unknown as JsonObject,
        {
          ...context,
          '/': path.sep,
          pathSeparator: path.sep,
        },
      ) as { [K in HookEventName]?: HookDefinition[] };

      return hydratedHooks;
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined; // File not found is not an error here.
      }
      debugLogger.warn(
        `Failed to load extension hooks from ${hooksFilePath}: ${getErrorMessage(
          e,
        )}`,
      );
      return undefined;
    }
  }

  toOutputString(extension: GeminiCLIExtension): string {
    const userEnabled = this.extensionEnablementManager.isEnabled(
      extension.name,
      homedir(),
    );
    const workspaceEnabled = this.extensionEnablementManager.isEnabled(
      extension.name,
      this.workspaceDir,
    );

    const status = workspaceEnabled ? chalk.green('✓') : chalk.red('✗');
    let output = `${status} ${extension.name} (${extension.version})`;
    output += `\n ID: ${extension.id}`;
    output += `\n name: ${hashValue(extension.name)}`;

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
    if (extension.skills && extension.skills.length > 0) {
      output += `\n Agent skills:`;
      extension.skills.forEach((skill) => {
        output += `\n  ${skill.name}: ${skill.description}`;
      });
    }
    const resolvedSettings = extension.resolvedSettings;
    if (resolvedSettings && resolvedSettings.length > 0) {
      output += `\n Settings:`;
      resolvedSettings.forEach((setting) => {
        let scope = '';
        if (setting.scope) {
          scope = setting.scope === 'workspace' ? '(Workspace' : '(User';
          if (setting.source) {
            scope += ` - ${setting.source}`;
          }
          scope += ')';
        }
        output += `\n  ${setting.name}: ${getFormattedSettingValue(setting)} ${scope}`;
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
        scope === SettingScope.Workspace ? this.workspaceDir : homedir();
      this.extensionEnablementManager.disable(name, true, scopePath);
    }
    await logExtensionDisable(
      this.telemetryConfig,
      new ExtensionDisableEvent(name, hashValue(name), extension.id, scope),
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
        scope === SettingScope.Workspace ? this.workspaceDir : homedir();
      this.extensionEnablementManager.enable(name, true, scopePath);
    }
    await logExtensionEnable(
      this.telemetryConfig,
      new ExtensionEnableEvent(name, hashValue(name), extension.id, scope),
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

export async function inferInstallMetadata(
  source: string,
  args: {
    ref?: string;
    autoUpdate?: boolean;
    allowPreRelease?: boolean;
  } = {},
): Promise<ExtensionInstallMetadata> {
  if (
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('git@') ||
    source.startsWith('sso://')
  ) {
    return {
      source,
      type: 'git',
      ref: args.ref,
      autoUpdate: args.autoUpdate,
      allowPreRelease: args.allowPreRelease,
    };
  } else {
    if (args.ref || args.autoUpdate) {
      throw new Error(
        '--ref and --auto-update are not applicable for local extensions.',
      );
    }
    try {
      await stat(source);
      return {
        source,
        type: 'local',
      };
    } catch {
      throw new Error('Install source not found.');
    }
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
