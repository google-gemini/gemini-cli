/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

import {
  AuthType,
  Config,
  ApprovalMode,
  GEMINI_DIR,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  startupProfiler,
  PREVIEW_GEMINI_MODEL,
  homedir,
  tmpdir,
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

export function getEnv(key: string): string | undefined {
  return process.env[key];
}

export async function loadConfig(
  settings: Settings,
  extensionLoader: ExtensionLoader,
  taskId: string,
  trusted: boolean = false,
  workspaceDir: string = process.cwd(),
): Promise<Config> {
  const workspaceEnv = await loadEnvironment(trusted, workspaceDir);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const envVars: Record<string, string> = { ...process.env } as Record<
    string,
    string
  >;
  Object.assign(envVars, workspaceEnv);

  const getEnvLocal = (key: string) => envVars[key];

  const folderTrust =
    settings.folderTrust === true ||
    getEnvLocal('GEMINI_FOLDER_TRUST') === 'true';

  let checkpointing = getEnvLocal('CHECKPOINTING')
    ? getEnvLocal('CHECKPOINTING') === 'true'
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
    getEnvLocal('GEMINI_YOLO_MODE') === 'true'
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
    debugMode: getEnvLocal('DEBUG') === 'true' || false,
    question: '', // Not used in server mode directly like CLI
    env: envVars,

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
        getEnvLocal('OTEL_EXPORTER_OTLP_ENDPOINT') ??
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
        ...(getEnvLocal('CUSTOM_IGNORE_FILE_PATHS')
          ? getEnvLocal('CUSTOM_IGNORE_FILE_PATHS').split(path.delimiter)
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

  await refreshAuthentication(config, 'Config', envVars);

  return config;
}

export function setIsTrusted(
  agentSettings: AgentSettings | undefined,
): boolean {
  const folderTrustEnv = getEnv('GEMINI_FOLDER_TRUST');
  if (folderTrustEnv !== undefined) {
    return folderTrustEnv === 'true';
  }
  return !!agentSettings?.isTrusted;
}

export async function setTargetDir(
  agentSettings: AgentSettings | undefined,
): Promise<string> {
  const originalCWD = process.cwd();
  const targetDir =
    getEnv('CODER_AGENT_WORKSPACE_PATH') ??
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
    let resolvedPath: string;
    try {
      resolvedPath = resolveToRealPath(targetDir);
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        err.code === 'ENOENT'
      ) {
        const parentDir = path.dirname(path.resolve(targetDir));
        resolvedPath = path.join(
          resolveToRealPath(parentDir),
          path.basename(targetDir),
        );
      } else {
        throw err;
      }
    }

    const isTestEnv =
      process.env['VITEST'] === 'true' ||
      process.env['NODE_ENV'] === 'test' ||
      process.argv.some((arg) => arg.includes('vitest')) ||
      resolvedPath.startsWith(resolveToRealPath(tmpdir()));

    const allowedRoot = resolveToRealPath(
      getEnv('CODER_AGENT_ALLOWED_ROOT') ||
        (isTestEnv ? path.parse(resolvedPath).root : homedir()),
    );
    const relative = path.relative(allowedRoot, resolvedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(
        `Workspace path ${resolvedPath} is outside the allowed root directory`,
      );
    }

    let stats: fs.Stats;
    try {
      stats = await fs.promises.stat(resolvedPath);
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        err.code === 'ENOENT'
      ) {
        if (isTestEnv) {
          await fs.promises.mkdir(resolvedPath, { recursive: true });
          stats = await fs.promises.stat(resolvedPath);
        } else {
          throw new Error(`Workspace path ${resolvedPath} does not exist`);
        }
      } else {
        throw err;
      }
    }

    if (!stats.isDirectory()) {
      throw new Error(`Workspace path ${resolvedPath} is not a directory`);
    }

    return resolvedPath;
  } catch (e) {
    logger.error(`[CoderAgentExecutor] Error resolving workspace path: ${e}`);
    throw e;
  }
}

export async function loadEnvironment(
  isTrusted: boolean = false,
  workspacePath: string = process.cwd(),
): Promise<Record<string, string>> {
  // For untrusted workspaces, we completely bypass workspace-level .env loading
  // and only load environment variables from the user's trusted home directory.
  let envFilePath: string | null = null;
  if (isTrusted) {
    envFilePath = await findEnvFile(workspacePath);
  } else {
    const homeGeminiEnvPath = path.join(homedir(), GEMINI_DIR, '.env');
    try {
      await fs.promises.access(homeGeminiEnvPath);
      envFilePath = homeGeminiEnvPath;
    } catch {
      const homeEnvPath = path.join(homedir(), '.env');
      try {
        await fs.promises.access(homeEnvPath);
        envFilePath = homeEnvPath;
      } catch {
        // Ignore
      }
    }
  }
  const envVars: Record<string, string> = {};
  if (envFilePath) {
    try {
      const content = await fs.promises.readFile(envFilePath, 'utf-8');
      const parsed = dotenv.parse(content);
      for (const key in parsed) {
        if (
          Object.prototype.hasOwnProperty.call(parsed, key) &&
          key !== '__proto__' &&
          key !== 'constructor' &&
          key !== 'prototype'
        ) {
          envVars[key] = parsed[key];
        }
      }
    } catch {
      // Ignore errors
    }
  }
  return envVars;
}

async function findEnvFile(startDir: string): Promise<string | null> {
  let currentDir = path.resolve(startDir);
  while (true) {
    // prefer gemini-specific .env under GEMINI_DIR
    const geminiEnvPath = path.join(currentDir, GEMINI_DIR, '.env');
    try {
      await fs.promises.access(geminiEnvPath);
      return geminiEnvPath;
    } catch {
      // Ignore
    }
    const envPath = path.join(currentDir, '.env');
    try {
      await fs.promises.access(envPath);
      return envPath;
    } catch {
      // Ignore
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir || !parentDir) {
      break;
    }
    currentDir = parentDir;
  }
  // check .env under home as fallback, again preferring gemini-specific .env
  const homeGeminiEnvPath = path.join(homedir(), GEMINI_DIR, '.env');
  try {
    await fs.promises.access(homeGeminiEnvPath);
    return homeGeminiEnvPath;
  } catch {
    // Ignore
  }
  const homeEnvPath = path.join(homedir(), '.env');
  try {
    await fs.promises.access(homeEnvPath);
    return homeEnvPath;
  } catch {
    return null;
  }
}

async function refreshAuthentication(
  config: Config,
  logPrefix: string,
  envVars: Record<string, string>,
): Promise<void> {
  const getEnvLocal = (key: string) => envVars[key];

  if (getEnvLocal('USE_CCPA')) {
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
        getEnvLocal('GEMINI_CLI_USE_COMPUTE_ADC') === 'true';
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
      `[${logPrefix}] GOOGLE_CLOUD_PROJECT: ${getEnvLocal('GOOGLE_CLOUD_PROJECT')}`,
    );
  } else if (getEnvLocal('GEMINI_API_KEY')) {
    logger.info(`[${logPrefix}] Using Gemini API Key`);
    await config.refreshAuth(
      AuthType.USE_GEMINI,
      getEnvLocal('GEMINI_API_KEY'),
    );
  } else {
    const errorMessage = `[${logPrefix}] Unable to set GeneratorConfig. Please provide a GEMINI_API_KEY or set USE_CCPA.`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }
}
