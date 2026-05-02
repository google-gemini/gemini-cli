/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type AgentLoopContext,
  AuthType,
  clearCachedCredentialFile,
  getVersion,
} from '@google/gemini-cli-core';
import * as acp from '@agentclientprotocol/sdk';
import { z } from 'zod';
import { SettingScope, type LoadedSettings } from '../config/settings.js';
import type { CliArgs } from '../config/config.js';
import { getAcpErrorMessage } from './acpErrors.js';
import { AcpSessionManager, type AuthDetails } from './acpSessionManager.js';
import { hasMeta } from './acpUtils.js';

export class GeminiAgent {
  private apiKey: string | undefined;
  private baseUrl: string | undefined;
  private customHeaders: Record<string, string> | undefined;
  private sessionManager: AcpSessionManager;

  constructor(
    private context: AgentLoopContext,
    private settings: LoadedSettings,
    argv: CliArgs,
    connection: acp.AgentSideConnection,
  ) {
    this.sessionManager = new AcpSessionManager(settings, argv, connection);
  }

  dispose(): void {
    this.sessionManager.dispose();
  }

  async initialize(
    args: acp.InitializeRequest,
  ): Promise<acp.InitializeResponse> {
    if (args.clientCapabilities) {
      this.sessionManager.setClientCapabilities(args.clientCapabilities);
    }

    const authMethods = [
      {
        id: AuthType.LOGIN_WITH_GOOGLE,
        name: 'Log in with Google',
        description: 'Log in with your Google account',
      },
      {
        id: AuthType.USE_GEMINI,
        name: 'Gemini API key',
        description: 'Use an API key with Gemini Developer API',
        _meta: {
          'api-key': {
            provider: 'google',
          },
        },
      },
      {
        id: AuthType.USE_VERTEX_AI,
        name: 'Vertex AI',
        description: 'Use an API key with Vertex AI GenAI API',
      },
      {
        id: AuthType.GATEWAY,
        name: 'AI API Gateway',
        description: 'Use a custom AI API Gateway',
        _meta: {
          gateway: {
            protocol: 'google',
            restartRequired: 'false',
          },
        },
      },
    ];

    await this.context.config.initialize();
    const version = await getVersion();
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      authMethods,
      agentInfo: {
        name: 'gemini-cli',
        title: 'Gemini CLI',
        version,
      },
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: {
          image: true,
          audio: true,
          embeddedContext: true,
        },
        mcpCapabilities: {
          http: true,
          sse: true,
        },
      },
    };
  }

  async authenticate(req: acp.AuthenticateRequest): Promise<void> {
    const { methodId } = req;
    const method = z.nativeEnum(AuthType).parse(methodId);
    const selectedAuthType = this.settings.merged.security.auth.selectedType;

    // Only clear credentials when switching to a different auth method
    if (selectedAuthType && selectedAuthType !== method) {
      await clearCachedCredentialFile();
    }
    // Check for api-key in _meta
    const meta = hasMeta(req) ? req._meta : undefined;
    const apiKey =
      typeof meta?.['api-key'] === 'string' ? meta['api-key'] : undefined;

    // Refresh auth with the requested method
    // This will reuse existing credentials if they're valid,
    // or perform new authentication if needed
    try {
      if (apiKey) {
        this.apiKey = apiKey;
      }

      // Extract gateway details if present
      const gatewaySchema = z.object({
        baseUrl: z.string().optional(),
        headers: z.record(z.string()).optional(),
      });

      let baseUrl: string | undefined;
      let headers: Record<string, string> | undefined;

      if (meta?.['gateway']) {
        const result = gatewaySchema.safeParse(meta['gateway']);
        if (result.success) {
          baseUrl = result.data.baseUrl;
          headers = result.data.headers;
        } else {
          throw new acp.RequestError(
            -32602,
            `Malformed gateway payload: ${result.error.message}`,
          );
        }
      }

      this.baseUrl = baseUrl;
      this.customHeaders = headers;

      await this.context.config.refreshAuth(
        method,
        apiKey ?? this.apiKey,
        baseUrl,
        headers,
      );
    } catch (e) {
      throw new acp.RequestError(-32000, getAcpErrorMessage(e));
    }
    this.settings.setValue(
      SettingScope.User,
      'security.auth.selectedType',
      method,
    );
  }

  private getAuthDetails(): AuthDetails {
    return {
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      customHeaders: this.customHeaders,
    };
  }

  async newSession(
    params: acp.NewSessionRequest,
  ): Promise<acp.NewSessionResponse> {
    return this.sessionManager.newSession(params, this.getAuthDetails());
  }

  async loadSession(
    params: acp.LoadSessionRequest,
  ): Promise<acp.LoadSessionResponse> {
    return this.sessionManager.loadSession(params, this.getAuthDetails());
  }

  async cancel(params: acp.CancelNotification): Promise<void> {
    const session = this.sessionManager.getSession(params.sessionId);
    if (!session) {
      throw new acp.RequestError(
        -32602,
        `Session not found: ${params.sessionId}`,
      );
    }
    await session.cancelPendingPrompt();
  }

  async prompt(params: acp.PromptRequest): Promise<acp.PromptResponse> {
    const session = this.sessionManager.getSession(params.sessionId);
    if (!session) {
      throw new acp.RequestError(
        -32602,
        `Session not found: ${params.sessionId}`,
      );
    }
    return session.prompt(params);
  }

  async setSessionMode(
    params: acp.SetSessionModeRequest,
  ): Promise<acp.SetSessionModeResponse> {
    const session = this.sessionManager.getSession(params.sessionId);
    if (!session) {
      throw new acp.RequestError(
        -32602,
        `Session not found: ${params.sessionId}`,
      );
    }
    return session.setMode(params.modeId);
  }

  async unstable_setSessionModel(
    params: acp.SetSessionModelRequest,
  ): Promise<acp.SetSessionModelResponse> {
    const session = this.sessionManager.getSession(params.sessionId);
    if (!session) {
      throw new acp.RequestError(
        -32602,
        `Session not found: ${params.sessionId}`,
      );
    }
    return session.setModel(params.modelId);
  }
}
