/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Config,
  AuthType,
  MCPServerConfig,
  debugLogger,
  startupProfiler,
  convertSessionToClientHistory,
  createPolicyUpdater,
} from '@google/gemini-cli-core';
import * as acp from '@agentclientprotocol/sdk';
import { randomUUID } from 'node:crypto';
import { loadSettings, type LoadedSettings } from '../config/settings.js';
import { SessionSelector } from '../utils/sessionUtils.js';
import { Session } from './acpSession.js';
import { AcpFileSystemService } from './acpFileSystemService.js';
import { getAcpErrorMessage } from './acpErrors.js';
import { buildAvailableModels, buildAvailableModes } from './acpUtils.js';
import { loadCliConfig, type CliArgs } from '../config/config.js';
import { startAutoMemoryIfEnabled } from '../utils/autoMemory.js';

export interface AuthDetails {
  apiKey?: string;
  baseUrl?: string;
  customHeaders?: Record<string, string>;
}

export class AcpSessionManager {
  private sessions: Map<string, Session> = new Map();
  private clientCapabilities: acp.ClientCapabilities | undefined;

  constructor(
    private settings: LoadedSettings,
    private argv: CliArgs,
    private connection: acp.AgentSideConnection,
  ) {}

  setClientCapabilities(capabilities: acp.ClientCapabilities) {
    this.clientCapabilities = capabilities;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.sessions.clear();
  }

  async newSession(
    { cwd, mcpServers }: acp.NewSessionRequest,
    authDetails: AuthDetails,
  ): Promise<acp.NewSessionResponse> {
    const sessionId = randomUUID();
    const loadedSettings = loadSettings(cwd);
    const config = await this.newSessionConfig(
      sessionId,
      cwd,
      mcpServers,
      loadedSettings,
    );

    const authType =
      loadedSettings.merged.security.auth.selectedType || AuthType.USE_GEMINI;

    let isAuthenticated = false;
    let authErrorMessage = '';
    try {
      await config.refreshAuth(
        authType,
        authDetails.apiKey,
        authDetails.baseUrl,
        authDetails.customHeaders,
      );
      isAuthenticated = true;

      // Extra validation for Gemini API key
      const contentGeneratorConfig = config.getContentGeneratorConfig();
      if (
        authType === AuthType.USE_GEMINI &&
        (!contentGeneratorConfig || !contentGeneratorConfig.apiKey)
      ) {
        isAuthenticated = false;
        authErrorMessage = 'Gemini API key is missing or not configured.';
      }
    } catch (e) {
      isAuthenticated = false;
      authErrorMessage = getAcpErrorMessage(e);
      debugLogger.error(
        `Authentication failed: ${e instanceof Error ? e.stack : e}`,
      );
    }

    if (!isAuthenticated) {
      throw new acp.RequestError(
        -32000,
        authErrorMessage || 'Authentication required.',
      );
    }

    if (this.clientCapabilities?.fs) {
      const acpFileSystemService = new AcpFileSystemService(
        this.connection,
        sessionId,
        this.clientCapabilities.fs,
        config.getFileSystemService(),
        cwd,
      );
      config.setFileSystemService(acpFileSystemService);
    }

    await config.initialize();
    startupProfiler.flush(config);
    startAutoMemoryIfEnabled(config);

    const geminiClient = config.getGeminiClient();

    const chat = await geminiClient.startChat();

    const session = new Session(
      sessionId,
      chat,
      config,
      this.connection,
      this.settings,
    );
    this.sessions.set(sessionId, session);

    setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      session.sendAvailableCommands();
    }, 0);

    const { availableModels, currentModelId } = buildAvailableModels(
      config,
      loadedSettings,
    );

    const response = {
      sessionId,
      modes: {
        availableModes: buildAvailableModes(config.isPlanEnabled()),
        currentModeId: config.getApprovalMode(),
      },
      models: {
        availableModels,
        currentModelId,
      },
    };
    return response;
  }

  async loadSession(
    { sessionId, cwd, mcpServers }: acp.LoadSessionRequest,
    authDetails: AuthDetails,
  ): Promise<acp.LoadSessionResponse> {
    const config = await this.initializeSessionConfig(
      sessionId,
      cwd,
      mcpServers,
      authDetails,
    );

    const sessionSelector = new SessionSelector(config.storage);

    const { sessionData, sessionPath } =
      await sessionSelector.resolveSession(sessionId);

    const clientHistory = convertSessionToClientHistory(sessionData.messages);

    const geminiClient = config.getGeminiClient();
    await geminiClient.initialize();
    await geminiClient.resumeChat(clientHistory, {
      conversation: sessionData,
      filePath: sessionPath,
    });

    const session = new Session(
      sessionId,
      geminiClient.getChat(),
      config,
      this.connection,
      this.settings,
    );

    const existingSession = this.sessions.get(sessionId);
    if (existingSession) {
      existingSession.dispose();
    }

    this.sessions.set(sessionId, session);

    // Stream history back to client
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    session.streamHistory(sessionData.messages);

    setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      session.sendAvailableCommands();
    }, 0);

    const { availableModels, currentModelId } = buildAvailableModels(
      config,
      this.settings,
    );

    const response = {
      modes: {
        availableModes: buildAvailableModes(config.isPlanEnabled()),
        currentModeId: config.getApprovalMode(),
      },
      models: {
        availableModels,
        currentModelId,
      },
    };
    return response;
  }

  private async initializeSessionConfig(
    sessionId: string,
    cwd: string,
    mcpServers: acp.McpServer[],
    authDetails: AuthDetails,
  ): Promise<Config> {
    const selectedAuthType = this.settings.merged.security.auth.selectedType;
    if (!selectedAuthType) {
      throw acp.RequestError.authRequired();
    }

    // 1. Create config WITHOUT initializing it (no MCP servers started yet)
    const config = await this.newSessionConfig(sessionId, cwd, mcpServers);

    // 2. Authenticate BEFORE initializing configuration or starting MCP servers.
    // This satisfies the security requirement to verify the user before executing
    // potentially unsafe server definitions.
    try {
      await config.refreshAuth(
        selectedAuthType,
        authDetails.apiKey,
        authDetails.baseUrl,
        authDetails.customHeaders,
      );
    } catch (e) {
      debugLogger.error(`Authentication failed: ${e}`);
      throw acp.RequestError.authRequired();
    }

    // 3. Set the ACP FileSystemService (if supported) before config initialization
    if (this.clientCapabilities?.fs) {
      const acpFileSystemService = new AcpFileSystemService(
        this.connection,
        sessionId,
        this.clientCapabilities.fs,
        config.getFileSystemService(),
        cwd,
      );
      config.setFileSystemService(acpFileSystemService);
    }

    // 4. Now that we are authenticated, it is safe to initialize the config
    // which starts the MCP servers and other heavy resources.
    await config.initialize();
    startupProfiler.flush(config);
    startAutoMemoryIfEnabled(config);

    return config;
  }

  async newSessionConfig(
    sessionId: string,
    cwd: string,
    mcpServers: acp.McpServer[],
    loadedSettings?: LoadedSettings,
  ): Promise<Config> {
    const currentSettings = loadedSettings || this.settings;
    const mergedMcpServers = { ...currentSettings.merged.mcpServers };

    for (const server of mcpServers) {
      if (
        'type' in server &&
        (server.type === 'sse' || server.type === 'http')
      ) {
        // HTTP or SSE MCP server
        const headers = Object.fromEntries(
          server.headers.map(({ name, value }) => [name, value]),
        );
        mergedMcpServers[server.name] = new MCPServerConfig(
          undefined, // command
          undefined, // args
          undefined, // env
          undefined, // cwd
          server.type === 'sse' ? server.url : undefined, // url (sse)
          server.type === 'http' ? server.url : undefined, // httpUrl
          headers,
        );
      } else if ('command' in server) {
        // Stdio MCP server
        const env: Record<string, string> = {};
        for (const { name: envName, value } of server.env) {
          env[envName] = value;
        }
        mergedMcpServers[server.name] = new MCPServerConfig(
          server.command,
          server.args,
          env,
          cwd,
        );
      }
    }

    const settings = {
      ...currentSettings.merged,
      mcpServers: mergedMcpServers,
    };

    const config = await loadCliConfig(settings, sessionId, this.argv, { cwd });

    createPolicyUpdater(
      config.getPolicyEngine(),
      config.messageBus,
      config.storage,
    );

    return config;
  }
}
