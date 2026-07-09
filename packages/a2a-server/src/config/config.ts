/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { AsyncLocalStorage } from 'node:async_hooks';

import {
  AuthType,
  Config,
  ApprovalMode,
  GEMINI_DIR,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  startupProfiler,
  PREVIEW_GEMINI_MODEL,
  homedir,
  GitService,
  fetchAdminControlsOnce,
  getCodeAssistServer,
  ExperimentFlags,
  isHeadlessMode,
  FatalAuthenticationError,
  createPolicyEngineConfig,
  type PolicySettings,
  type TelemetryTarget,
  type ConfigParameters,
  type ExtensionLoader,
  resolveToRealPath,
} from '@google/gemini-cli-core';

import { logger } from '../utils/logger.js';
import type { Settings } from './settings.js';
import { type AgentSettings, CoderAgentEvent } from '../types.js';

export const envStorage = new AsyncLocalStorage<TaskEnv>();

const deletedKeysSymbol = Symbol('deletedKeys');
export const cwdSymbol = Symbol('cwd');

export interface TaskEnv extends Record<string, string> {
  [deletedKeysSymbol]?: Set<string>;
  [cwdSymbol]?: string;
}

// Set up a Proxy on process.env to intercept reads and writes, isolating environment variables per task
const originalEnv = process.env;
const envProxy = new Proxy(originalEnv, {
  get(target, prop) {
    if (typeof prop === 'string') {
      const taskEnv = envStorage.getStore();
      if (taskEnv) {
        const deleted = taskEnv[deletedKeysSymbol];
        if (deleted?.has(prop)) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(taskEnv, prop)) {
          return taskEnv[prop];
        }
      }
    }
    return target[prop];
  },
  has(target, prop) {
    if (typeof prop === 'string') {
      const taskEnv = envStorage.getStore();
      if (taskEnv) {
        const deleted = taskEnv[deletedKeysSymbol];
        if (deleted?.has(prop)) {
          return false;
        }
        if (Object.prototype.hasOwnProperty.call(taskEnv, prop)) {
          return true;
        }
      }
    }
    return prop in target;
  },
  set(target, prop, value) {
    if (typeof prop === 'string') {
      if (
        prop === '__proto__' ||
        prop === 'constructor' ||
        prop === 'prototype'
      ) {
        return false;
      }
      const taskEnv = envStorage.getStore();
      if (taskEnv) {
        taskEnv[deletedKeysSymbol]?.delete(prop);
        taskEnv[prop] = String(value);
        return true;
      }
    }
    target[prop] = String(value);
    return true;
  },
  deleteProperty(target, prop) {
    if (typeof prop === 'string') {
      if (
        prop === '__proto__' ||
        prop === 'constructor' ||
        prop === 'prototype'
      ) {
        return false;
      }
      const taskEnv = envStorage.getStore();
      if (taskEnv) {
        delete taskEnv[prop];
        (taskEnv[deletedKeysSymbol] ??= new Set()).add(prop);
        return true;
      }
    }
    delete target[prop];
    return true;
  },
  ownKeys(target) {
    const taskEnv = envStorage.getStore();
    if (taskEnv) {
      const keys = new Set<string | symbol>([
        ...Object.getOwnPropertyNames(target),
        ...Object.getOwnPropertySymbols(target),
        ...Object.keys(taskEnv),
      ]);
      taskEnv[deletedKeysSymbol]?.forEach((key) => {
        keys.delete(key);
      });
      return Array.from(keys);
    }
    return [
      ...Object.getOwnPropertyNames(target),
      ...Object.getOwnPropertySymbols(target),
    ];
  },
  getOwnPropertyDescriptor(target, prop) {
    const taskEnv = envStorage.getStore();
    if (taskEnv && typeof prop === 'string') {
      const deleted = taskEnv[deletedKeysSymbol];
      if (deleted?.has(prop)) {
        return undefined;
      }
      if (Object.prototype.hasOwnProperty.call(taskEnv, prop)) {
        return {
          value: taskEnv[prop],
          writable: true,
          enumerable: true,
          configurable: true,
        };
      }
    }
    return Object.getOwnPropertyDescriptor(target, prop);
  },
});

// Replace process.env with the proxy
Object.defineProperty(process, 'env', {
  value: envProxy,
  writable: true,
  configurable: true,
});

// NOTE: Monkey-patching process.cwd and process.chdir via AsyncLocalStorage is a robust way
// to simulate workspace isolation in a concurrent server. However, please be aware of a critical
// limitation: Node.js native C++ APIs (such as fs.readFileSync, fs.writeFile, etc.) and child
// process spawning APIs (like child_process.spawn) resolve relative paths using the OS-level
// working directory of the process, NOT the JS-level process.cwd() function.
// To prevent cross-task interference, all file paths in the core package must be resolved to
// absolute paths using path.resolve/path.join relative to config.getTargetDir() or config.getCwd()
// before being passed to native APIs.
const originalCwd = process.cwd;
process.cwd = function () {
  const taskEnv = envStorage.getStore();
  if (taskEnv && taskEnv[cwdSymbol]) {
    return taskEnv[cwdSymbol];
  }
  return originalCwd.call(process);
};

const originalChdir = process.chdir;
process.chdir = function (directory: string) {
  const taskEnv = envStorage.getStore();
  if (taskEnv) {
    const resolved = path.resolve(process.cwd(), directory);
    const stats = fs.statSync(resolved);
    if (!stats.isDirectory()) {
      const err = new Error(
        "ENOTDIR: not a directory, chdir '" + resolved + "'",
      );
      (err as NodeJS.ErrnoException).code = 'ENOTDIR';
      throw err;
    }
    taskEnv[cwdSymbol] = resolved;
    return;
  }
  return originalChdir.call(process, directory);
};

const INITIAL_FOLDER_TRUST = process.env['GEMINI_FOLDER_TRUST'];

export async function loadConfig(
  settings: Settings,
  extensionLoader: ExtensionLoader,
  taskId: string,
  trusted: boolean = false,
  workspaceDir: string = process.cwd(),
): Promise<Config> {
  const folderTrust =
    settings.folderTrust === true ||
    process.env['GEMINI_FOLDER_TRUST'] === 'true';

  let checkpointing = process.env['CHECKPOINTING']
    ? process.env['CHECKPOINTING'] === 'true'
    : settings.checkpointing?.enabled;

  if (checkpointing) {
    if (!(await GitService.verifyGitAvailability())) {
      logger.warn(
        '[Config] Checkpointing is enabled but git is not installed. Disabling checkpointing.',
      );
      checkpointing = false;
    }
  }

  const approvalMode =
    process.env['GEMINI_YOLO_MODE'] === 'true'
      ? ApprovalMode.YOLO
      : ApprovalMode.DEFAULT;

  const policySettings: PolicySettings = {
    mcpServers: settings.mcpServers,
    tools: {
      core: settings.tools?.core,
      exclude: settings.tools?.exclude,
      allowed: settings.tools?.allowed,
    },
    policyPaths: settings.policyPaths,
    adminPolicyPaths: settings.adminPolicyPaths,
  };

  const policyEngineConfig = await createPolicyEngineConfig(
    policySettings,
    approvalMode,
    undefined,
    true,
  );

  const configParams: ConfigParameters = {
    sessionId: taskId,
    clientName: 'a2a-server',
    model: PREVIEW_GEMINI_MODEL,
    embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL,
    sandbox: undefined, // Sandbox might not be relevant for a server-side agent
    targetDir: workspaceDir, // Or a specific directory the agent operates on
    debugMode: process.env['DEBUG'] === 'true' || false,
    question: '', // Not used in server mode directly like CLI

    coreTools: settings.tools?.core || undefined,
    excludeTools: settings.tools?.exclude || undefined,
    allowedTools: settings.tools?.allowed || undefined,
    showMemoryUsage: settings.showMemoryUsage || false,
    approvalMode,
    policyEngineConfig,
    mcpServers: settings.mcpServers,
    cwd: workspaceDir,
    telemetry: {
      enabled: settings.telemetry?.enabled,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      target: settings.telemetry?.target as TelemetryTarget,
      otlpEndpoint:
        process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ??
        settings.telemetry?.otlpEndpoint,
      logPrompts: settings.telemetry?.logPrompts,
    },
    // Git-aware file filtering settings
    fileFiltering: {
      respectGitIgnore: settings.fileFiltering?.respectGitIgnore,
      respectGeminiIgnore: settings.fileFiltering?.respectGeminiIgnore,
      enableRecursiveFileSearch:
        settings.fileFiltering?.enableRecursiveFileSearch,
      customIgnoreFilePaths: [
        ...(settings.fileFiltering?.customIgnoreFilePaths || []),
        ...(process.env['CUSTOM_IGNORE_FILE_PATHS']
          ? process.env['CUSTOM_IGNORE_FILE_PATHS'].split(path.delimiter)
          : []),
      ],
    },
    ideMode: false,
    folderTrust,
    trustedFolder: trusted,
    extensionLoader,
    checkpointing,
    interactive: true,
    enableInteractiveShell: !isHeadlessMode(),
    ptyInfo: 'auto',
    enableAgents: settings.experimental?.enableAgents ?? true,
  };

  // Set an initial config to use to get a code assist server.
  // This is needed to fetch admin controls.
  const initialConfig = new Config({
    ...configParams,
  });

  const codeAssistServer = getCodeAssistServer(initialConfig);

  const adminControlsEnabled =
    initialConfig.getExperiments()?.flags[ExperimentFlags.ENABLE_ADMIN_CONTROLS]
      ?.boolValue ?? false;

  // Initialize final config parameters to the previous parameters.
  // If no admin controls are needed, these will be used as-is for the final
  // config.
  const finalConfigParams = { ...configParams };
  if (adminControlsEnabled) {
    const adminSettings = await fetchAdminControlsOnce(
      codeAssistServer,
      adminControlsEnabled,
    );

    // Admin settings are able to be undefined if unset, but if any are present,
    // we should initialize them all.
    // If any are present, undefined settings should be treated as if they were
    // set to false.
    // If NONE are present, disregard admin settings entirely, and pass the
    // final config as is.
    if (Object.keys(adminSettings).length !== 0) {
      finalConfigParams.disableYoloMode = !adminSettings.strictModeDisabled;
      finalConfigParams.mcpEnabled = adminSettings.mcpSetting?.mcpEnabled;
      finalConfigParams.extensionsEnabled =
        adminSettings.cliFeatureSetting?.extensionsSetting?.extensionsEnabled;
    }
  }

  const config = new Config(finalConfigParams);

  // Needed to initialize ToolRegistry, and git checkpointing if enabled
  await config.initialize();

  await config.waitForMcpInit();
  startupProfiler.flush(config);

  await refreshAuthentication(config, 'Config');

  return config;
}

export function setIsTrusted(
  agentSettings: AgentSettings | undefined,
): boolean {
  if (INITIAL_FOLDER_TRUST !== undefined) {
    return INITIAL_FOLDER_TRUST === 'true';
  }
  return !!agentSettings?.isTrusted;
}

export function setTargetDir(agentSettings: AgentSettings | undefined): string {
  const originalCWD = process.cwd();
  const targetDir =
    process.env['CODER_AGENT_WORKSPACE_PATH'] ??
    (agentSettings?.kind === CoderAgentEvent.StateAgentSettingsEvent
      ? agentSettings.workspacePath
      : undefined);

  if (!targetDir) {
    return originalCWD;
  }

  logger.info(
    `[CoderAgentExecutor] Overriding workspace path to: ${targetDir}`,
  );

  try {
    const resolvedPath = resolveToRealPath(targetDir);
    if (
      !fs.existsSync(resolvedPath) ||
      !fs.statSync(resolvedPath).isDirectory()
    ) {
      logger.warn(
        `[CoderAgentExecutor] Workspace path ${resolvedPath} does not exist or is not a directory, returning original os.cwd()`,
      );
      return originalCWD;
    }
    return resolvedPath;
  } catch (e) {
    logger.error(
      `[CoderAgentExecutor] Error resolving workspace path: ${e}, returning original os.cwd()`,
    );
    return originalCWD;
  }
}

export function loadEnvironment(
  isTrusted: boolean = false,
  workspacePath: string = process.cwd(),
): Record<string, string> {
  // For untrusted workspaces, we completely bypass workspace-level .env loading
  // and only load environment variables from the user's trusted home directory.
  let envFilePath: string | null = null;
  if (isTrusted) {
    envFilePath = findEnvFile(workspacePath);
  } else {
    const homeGeminiEnvPath = path.join(homedir(), GEMINI_DIR, '.env');
    if (fs.existsSync(homeGeminiEnvPath)) {
      envFilePath = homeGeminiEnvPath;
    } else {
      const homeEnvPath = path.join(homedir(), '.env');
      if (fs.existsSync(homeEnvPath)) {
        envFilePath = homeEnvPath;
      }
    }
  }
  const envVars: Record<string, string> = {};
  if (envFilePath) {
    try {
      const content = fs.readFileSync(envFilePath, 'utf-8');
      const parsed = dotenv.parse(content);
      for (const key in parsed) {
        if (Object.prototype.hasOwnProperty.call(parsed, key)) {
          envVars[key] = parsed[key];
          process.env[key] = parsed[key];
        }
      }
    } catch {
      // Ignore errors
    }
  }
  return envVars;
}

function findEnvFile(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  while (true) {
    // prefer gemini-specific .env under GEMINI_DIR
    const geminiEnvPath = path.join(currentDir, GEMINI_DIR, '.env');
    if (fs.existsSync(geminiEnvPath)) {
      return geminiEnvPath;
    }
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      return envPath;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir || !parentDir) {
      break;
    }
    currentDir = parentDir;
  }
  // check .env under home as fallback, again preferring gemini-specific .env
  const homeGeminiEnvPath = path.join(homedir(), GEMINI_DIR, '.env');
  if (fs.existsSync(homeGeminiEnvPath)) {
    return homeGeminiEnvPath;
  }
  const homeEnvPath = path.join(homedir(), '.env');
  return fs.existsSync(homeEnvPath) ? homeEnvPath : null;
}

async function refreshAuthentication(
  config: Config,
  logPrefix: string,
): Promise<void> {
  if (process.env['USE_CCPA']) {
    logger.info(`[${logPrefix}] Using CCPA Auth:`);

    logger.info(`[${logPrefix}] Attempting COMPUTE_ADC first.`);
    try {
      await config.refreshAuth(AuthType.COMPUTE_ADC);
      logger.info(`[${logPrefix}] COMPUTE_ADC successful.`);
    } catch (adcError) {
      const adcMessage =
        adcError instanceof Error ? adcError.message : String(adcError);
      logger.info(
        `[${logPrefix}] COMPUTE_ADC failed or not available: ${adcMessage}`,
      );

      const useComputeAdc =
        process.env['GEMINI_CLI_USE_COMPUTE_ADC'] === 'true';
      const isHeadless = isHeadlessMode();

      if (isHeadless || useComputeAdc) {
        const reason = isHeadless
          ? 'headless mode'
          : 'GEMINI_CLI_USE_COMPUTE_ADC=true';
        throw new FatalAuthenticationError(
          `COMPUTE_ADC failed: ${adcMessage}. (LOGIN_WITH_GOOGLE fallback skipped due to ${reason}. Run in an interactive terminal to use OAuth.)`,
        );
      }

      logger.info(
        `[${logPrefix}] COMPUTE_ADC failed, falling back to LOGIN_WITH_GOOGLE.`,
      );
      try {
        await config.refreshAuth(AuthType.LOGIN_WITH_GOOGLE);
      } catch (e) {
        if (e instanceof FatalAuthenticationError) {
          const originalMessage = e instanceof Error ? e.message : String(e);
          throw new FatalAuthenticationError(
            `${originalMessage}. The initial COMPUTE_ADC attempt also failed: ${adcMessage}`,
          );
        }
        throw e;
      }
    }

    logger.info(
      `[${logPrefix}] GOOGLE_CLOUD_PROJECT: ${process.env['GOOGLE_CLOUD_PROJECT']}`,
    );
  } else if (process.env['GEMINI_API_KEY']) {
    logger.info(`[${logPrefix}] Using Gemini API Key`);
    await config.refreshAuth(AuthType.USE_GEMINI);
  } else {
    const errorMessage = `[${logPrefix}] Unable to set GeneratorConfig. Please provide a GEMINI_API_KEY or set USE_CCPA.`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }
}
