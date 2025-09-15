/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import * as dotenv from 'dotenv';

import type { TelemetryTarget } from '@google/gemini-cli-core';
import {
  AuthType,
  Config,
  type ConfigParameters,
  FileDiscoveryService,
  ApprovalMode,
  loadServerHierarchicalMemory,
  GEMINI_CONFIG_DIR,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  DEFAULT_GEMINI_MODEL,
} from '@google/gemini-cli-core';

import { logger } from '../utils/logger.js';
import type { Settings } from './settings.js';
import type { Extension } from './extension.js';
import { type AgentSettings, CoderAgentEvent } from '../types.js';

export async function loadConfig(
  settings: Settings,
  extensions: Extension[],
  taskId: string,
): Promise<Config> {
  const mcpServers = mergeMcpServers(settings, extensions);
  const workspaceDir = process.cwd();
  const adcFilePath = process.env['GOOGLE_APPLICATION_CREDENTIALS'];

  // Compute an approval mode that keeps default behavior in untrusted workspaces
  const envYolo = process.env['GEMINI_YOLO_MODE'] === 'true';
  let approvalMode = envYolo ? ApprovalMode.YOLO : ApprovalMode.DEFAULT;
  if (settings.folderTrust !== true) {
    approvalMode = ApprovalMode.DEFAULT;
  }

  const configParams: ConfigParameters = {
    sessionId: taskId,
    model: DEFAULT_GEMINI_MODEL,
    embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL,
    sandbox: undefined, // Sandbox might not be relevant for a server-side agent
    targetDir: workspaceDir, // Or a specific directory the agent operates on
    debugMode: process.env['DEBUG'] === 'true' || false,
    question: '', // Not used in server mode directly like CLI
    fullContext: false, // Server might have different context needs
    coreTools: settings.coreTools || undefined,
    excludeTools: settings.excludeTools || undefined,
    showMemoryUsage: settings.showMemoryUsage || false,
    approvalMode,
    mcpServers,
    cwd: workspaceDir,
    telemetry: {
      enabled: settings.telemetry?.enabled,
      target: settings.telemetry?.target as TelemetryTarget,
      otlpEndpoint:
        process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ??
        settings.telemetry?.otlpEndpoint,
      logPrompts: settings.telemetry?.logPrompts,
    },
    // Git-aware file filtering settings
    fileFiltering: {
      respectGitIgnore: settings.fileFiltering?.respectGitIgnore,
      enableRecursiveFileSearch:
        settings.fileFiltering?.enableRecursiveFileSearch,
    },
    ideMode: false,
    folderTrust: settings.folderTrust === true,
  };

  const fileService = new FileDiscoveryService(workspaceDir);
  const extensionContextFilePaths = extensions.flatMap((e) => e.contextFiles);
  const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
    workspaceDir,
    [workspaceDir],
    false,
    fileService,
    extensionContextFilePaths,
    settings.folderTrust === true ? 'tree' : 'flat',
  );
  configParams.userMemory = memoryContent;
  configParams.geminiMdFileCount = fileCount;
  const config = new Config({
    ...configParams,
  });
  // Needed to initialize ToolRegistry, and git checkpointing if enabled
  await config.initialize();

  const useVertex = process.env['GOOGLE_GENAI_USE_VERTEXAI'] === 'true';

  if (useVertex) {
    const hasVertexApiKey = !!process.env['GOOGLE_API_KEY'];
    const hasVertexADC = !!process.env['GOOGLE_CLOUD_PROJECT'] && !!process.env['GOOGLE_CLOUD_LOCATION'];
    if (hasVertexApiKey || hasVertexADC) {
      logger.info('[Config] Using Vertex AI');
      await config.refreshAuth(AuthType.USE_VERTEX_AI);
      return config;
    } else {
      logger.error('[Config] GOOGLE_GENAI_USE_VERTEXAI is true but neither GOOGLE_API_KEY nor (GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION) are set.');
    }
  }

  if (process.env['USE_CCPA']) {
    logger.info('[Config] Using CCPA Auth:');
    try {
      if (adcFilePath && !fs.existsSync(adcFilePath)) {
        throw new Error('ADC file not found');
      }
    } catch (e) {
      logger.error(
        `[Config] USE_CCPA env var is true but unable to resolve GOOGLE_APPLICATION_CREDENTIALS file path ${adcFilePath}. Error ${e}`,
      );
    }
    await config.refreshAuth(AuthType.LOGIN_WITH_GOOGLE);
    logger.info(
      `[Config] GOOGLE_CLOUD_PROJECT: ${process.env['GOOGLE_CLOUD_PROJECT']}`,
    );
  } else if (process.env['GEMINI_API_KEY']) {
    logger.info('[Config] Using Gemini API Key');
    await config.refreshAuth(AuthType.USE_GEMINI);
  } else {
    const errorMessage =
      '[Config] Unable to set GeneratorConfig. Provide GEMINI_API_KEY, or set GOOGLE_GENAI_USE_VERTEXAI=true with GOOGLE_API_KEY or ADC (GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION), or set USE_CCPA.';
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  return config;
}

export function mergeMcpServers(settings: Settings, extensions: Extension[]) {
  const mcpServers = { ...(settings.mcpServers || {}) };
  const isValidKey = (key: string) => /^[a-zA-Z0-9_.-]{1,50}$/.test(key);
  for (const extension of extensions) {
    Object.entries(extension.config.mcpServers || {}).forEach(
      ([key, server]) => {
        if (!isValidKey(key)) {
          return;
        }
        if (mcpServers[key]) {
          console.warn(
            `Skipping extension MCP config for server with key "${key}" as it already exists.`,
          );
          return;
        }
        mcpServers[key] = server;
      },
    );
  }
  return mcpServers;
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
    const resolvedPath = path.resolve(targetDir);
    process.chdir(resolvedPath);
    return resolvedPath;
  } catch (e) {
    logger.error(
      `[CoderAgentExecutor] Error resolving workspace path: ${e}, returning original os.cwd()`,
    );
    return originalCWD;
  }
}

export function loadEnvironment(): void {
  const envFilePath = findEnvFile(process.cwd());
  if (envFilePath) {
    // Preserve existing environment to favor upstream configuration
    dotenv.config({ path: envFilePath, override: false });
  }
}

function findEnvFile(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  while (true) {
    // prefer gemini-specific .env under GEMINI_DIR
    const geminiEnvPath = path.join(currentDir, GEMINI_CONFIG_DIR, '.env');
    if (fs.existsSync(geminiEnvPath)) {
      return geminiEnvPath;
    }
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      return envPath;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir || !parentDir) {
      // check .env under home as fallback, again preferring gemini-specific .env
      const homeGeminiEnvPath = path.join(
        homedir(),
        GEMINI_CONFIG_DIR,
        '.env',
      );
      if (fs.existsSync(homeGeminiEnvPath)) {
        return homeGeminiEnvPath;
      }
      const homeEnvPath = path.join(homedir(), '.env');
      if (fs.existsSync(homeEnvPath)) {
        return homeEnvPath;
      }
      return null;
    }
    currentDir = parentDir;
  }
}
