/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import { act } from 'react';
import stripAnsi from 'strip-ansi';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { AppContainer } from '../ui/AppContainer.js';
import { renderWithProviders } from './render.js';
import {
  makeFakeConfig,
  type Config,
  type ConfigParameters,
  ExtensionLoader,
  AuthType,
  ApprovalMode,
  createPolicyEngineConfig,
  PolicyDecision,
  ToolConfirmationOutcome,
  MessageBusType,
  type ToolCallsUpdateMessage,
  coreEvents,
  ideContextStore,
  createContentGenerator,
  IdeClient,
  debugLogger,
} from '@google/gemini-cli-core';
import {
  type MockShellCommand,
  MockShellExecutionService,
} from './MockShellExecutionService.js';
import { createMockSettings } from './settings.js';
import { type LoadedSettings } from '../config/settings.js';
import { AuthState } from '../ui/types.js';

// Mock core functions globally for tests using AppRig.
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  const { MockShellExecutionService: MockService } = await import(
    './MockShellExecutionService.js'
  );
  // Register the real execution logic so MockShellExecutionService can fall back to it
  MockService.setOriginalImplementation(original.ShellExecutionService.execute);

  return {
    ...original,
    ShellExecutionService: MockService,
  };
});

// Mock useAuthCommand to bypass authentication flows in tests
vi.mock('../ui/auth/useAuth.js', () => ({
  useAuthCommand: () => ({
    authState: AuthState.Authenticated,
    setAuthState: vi.fn(),
    authError: null,
    onAuthError: vi.fn(),
    apiKeyDefaultValue: 'test-api-key',
    reloadApiKey: vi.fn().mockResolvedValue('test-api-key'),
  }),
  validateAuthMethodWithSettings: () => null,
}));

// A minimal mock ExtensionManager to satisfy AppContainer's forceful cast
class MockExtensionManager extends ExtensionLoader {
  getExtensions = vi.fn().mockReturnValue([]);
  setRequestConsent = vi.fn();
  setRequestSetting = vi.fn();
}

// Mock GeminiRespondingSpinner to disable animations (avoiding 'act()' warnings) without triggering screen reader mode.
vi.mock('../ui/components/GeminiRespondingSpinner.js', async () => {
  const React = await import('react');
  const { Text } = await import('ink');
  return {
    GeminiSpinner: () => React.createElement(Text, null, '...'),
    GeminiRespondingSpinner: ({
      nonRespondingDisplay,
    }: {
      nonRespondingDisplay: string;
    }) => React.createElement(Text, null, nonRespondingDisplay || '...'),
  };
});

export interface AppRigOptions {
  fakeResponsesPath?: string;
  terminalWidth?: number;
  terminalHeight?: number;
  configOverrides?: Partial<ConfigParameters>;
}

export interface PendingConfirmation {
  toolName: string;
  toolDisplayName?: string;
  correlationId: string;
}

export class AppRig {
  private renderResult: ReturnType<typeof renderWithProviders> | undefined;
  private config: Config | undefined;
  private settings: LoadedSettings | undefined;
  private testDir: string;
  private sessionId: string;

  private pendingConfirmations = new Map<string, PendingConfirmation>();
  private breakpointTools = new Set<string | undefined>();
  private lastAwaitedConfirmation: PendingConfirmation | undefined;

  constructor(private options: AppRigOptions = {}) {
    this.testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-app-rig-'));
    this.sessionId = `test-session-${Math.random().toString(36).slice(2, 9)}`;
  }

  async initialize() {
    this.setupEnvironment();
    this.settings = this.createRigSettings();

    const approvalMode =
      this.options.configOverrides?.approvalMode ?? ApprovalMode.DEFAULT;
    const policyEngineConfig = await createPolicyEngineConfig(
      this.settings.merged,
      approvalMode,
    );

    const configParams: ConfigParameters = {
      sessionId: this.sessionId,
      targetDir: this.testDir,
      cwd: this.testDir,
      debugMode: false,
      model: 'test-model',
      fakeResponses: this.options.fakeResponsesPath,
      interactive: true,
      approvalMode,
      policyEngineConfig,
      enableEventDrivenScheduler: true,
      extensionLoader: new MockExtensionManager(),
      excludeTools: this.options.configOverrides?.excludeTools,
      ...this.options.configOverrides,
    };
    this.config = makeFakeConfig(configParams);

    if (this.options.fakeResponsesPath) {
      this.stubRefreshAuth();
    }

    this.setupMessageBusListeners();

    await act(async () => {
      await this.config!.initialize();
      // Since we mocked useAuthCommand, we must manually trigger the first
      // refreshAuth to ensure contentGenerator is initialized.
      await this.config!.refreshAuth(AuthType.USE_GEMINI);
    });
  }

  private setupEnvironment() {
    // Stub environment variables to avoid interference from developer's machine
    vi.stubEnv('GEMINI_CLI_HOME', this.testDir);
    if (this.options.fakeResponsesPath) {
      vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
      MockShellExecutionService.setPassthrough(false);
    } else {
      if (!process.env['GEMINI_API_KEY']) {
        throw new Error(
          'GEMINI_API_KEY must be set in the environment for live model tests.',
        );
      }
      // For live tests, we allow falling through to the real shell service if no mock matches
      MockShellExecutionService.setPassthrough(true);
    }
    vi.stubEnv('GEMINI_DEFAULT_AUTH_TYPE', AuthType.USE_GEMINI);
  }

  private createRigSettings(): LoadedSettings {
    return createMockSettings({
      user: {
        path: path.join(this.testDir, '.gemini', 'user_settings.json'),
        settings: {
          security: {
            auth: {
              selectedType: AuthType.USE_GEMINI,
              useExternal: true,
            },
            folderTrust: {
              enabled: true,
            },
          },
          ide: {
            enabled: false,
            hasSeenNudge: true,
          },
        },
        originalSettings: {},
      },
      merged: {
        security: {
          auth: {
            selectedType: AuthType.USE_GEMINI,
            useExternal: true,
          },
          folderTrust: {
            enabled: true,
          },
        },
        ide: {
          enabled: false,
          hasSeenNudge: true,
        },
      },
    });
  }

  private stubRefreshAuth() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const gcConfig = this.config as any;
    gcConfig.refreshAuth = async (authMethod: AuthType) => {
      gcConfig.modelAvailabilityService.reset();

      const newContentGeneratorConfig = {
        authType: authMethod,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        proxy: gcConfig.getProxy(),
        apiKey: process.env['GEMINI_API_KEY'] || 'test-api-key',
      };

      gcConfig.contentGenerator = await createContentGenerator(
        newContentGeneratorConfig,
        this.config!,
        gcConfig.getSessionId(),
      );
      gcConfig.contentGeneratorConfig = newContentGeneratorConfig;

      // Initialize BaseLlmClient now that the ContentGenerator is available
      const { BaseLlmClient } = await import('@google/gemini-cli-core');
      gcConfig.baseLlmClient = new BaseLlmClient(
        gcConfig.contentGenerator,
        this.config!,
      );
    };
  }

  private setupMessageBusListeners() {
    if (!this.config) return;
    const messageBus = this.config.getMessageBus();

    messageBus.subscribe(
      MessageBusType.TOOL_CALLS_UPDATE,
      (message: ToolCallsUpdateMessage) => {
        for (const call of message.toolCalls) {
          if (call.status === 'awaiting_approval' && call.correlationId) {
            const details = call.confirmationDetails;
            const title = 'title' in details ? details.title : '';
            const toolDisplayName =
              call.tool?.displayName || title.replace(/^Confirm:\s*/, '');
            if (!this.pendingConfirmations.has(call.correlationId)) {
              this.pendingConfirmations.set(call.correlationId, {
                toolName: call.request.name,
                toolDisplayName,
                correlationId: call.correlationId,
              });
            }
          } else if (call.status !== 'awaiting_approval') {
            for (const [
              correlationId,
              pending,
            ] of this.pendingConfirmations.entries()) {
              if (pending.toolName === call.request.name) {
                this.pendingConfirmations.delete(correlationId);
                break;
              }
            }
          }
        }
      },
    );
  }

  render() {
    if (!this.config || !this.settings)
      throw new Error('AppRig not initialized');

    act(() => {
      this.renderResult = renderWithProviders(
        <AppContainer
          config={this.config!}
          version="test-version"
          initializationResult={{
            authError: null,
            themeError: null,
            shouldOpenAuthDialog: false,
            geminiMdFileCount: 0,
          }}
        />,
        {
          config: this.config!,
          settings: this.settings!,
          width: this.options.terminalWidth ?? 120,
          useAlternateBuffer: false,
          uiState: {
            terminalHeight: this.options.terminalHeight ?? 40,
          },
        },
      );
    });
  }

  setMockCommands(commands: MockShellCommand[]) {
    MockShellExecutionService.setMockCommands(commands);
  }

  setToolPolicy(
    toolName: string | undefined,
    decision: PolicyDecision,
    priority = 10,
  ) {
    if (!this.config) throw new Error('AppRig not initialized');
    this.config.getPolicyEngine().addRule({
      toolName,
      decision,
      priority,
      source: 'AppRig Override',
    });
  }

  setBreakpoint(toolName: string | string[] | undefined) {
    if (Array.isArray(toolName)) {
      for (const name of toolName) {
        this.setBreakpoint(name);
      }
    } else {
      this.setToolPolicy(toolName, PolicyDecision.ASK_USER, 100);
      this.breakpointTools.add(toolName);
    }
  }

  removeToolPolicy(toolName?: string, source = 'AppRig Override') {
    if (!this.config) throw new Error('AppRig not initialized');
    this.config
      .getPolicyEngine()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      .removeRulesForTool(toolName as string, source);
    this.breakpointTools.delete(toolName);
  }

  getTestDir(): string {
    return this.testDir;
  }

  getPendingConfirmations() {
    return Array.from(this.pendingConfirmations.values());
  }

  private async waitUntil(
    predicate: () => boolean | Promise<boolean>,
    options: { timeout?: number; interval?: number; message?: string } = {},
  ) {
    const {
      timeout = 30000,
      interval = 100,
      message = 'Condition timed out',
    } = options;
    const start = Date.now();

    while (true) {
      if (await predicate()) return;

      if (Date.now() - start > timeout) {
        throw new Error(message);
      }

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, interval));
      });
    }
  }

  async waitForPendingConfirmation(
    toolNameOrDisplayName?: string | RegExp,
    timeout = 30000,
  ): Promise<PendingConfirmation> {
    const matches = (p: PendingConfirmation) => {
      if (!toolNameOrDisplayName) return true;
      if (typeof toolNameOrDisplayName === 'string') {
        return (
          p.toolName === toolNameOrDisplayName ||
          p.toolDisplayName === toolNameOrDisplayName
        );
      }
      return (
        toolNameOrDisplayName.test(p.toolName) ||
        toolNameOrDisplayName.test(p.toolDisplayName || '')
      );
    };

    let matched: PendingConfirmation | undefined;
    await this.waitUntil(
      () => {
        matched = this.getPendingConfirmations().find(matches);
        return !!matched;
      },
      {
        timeout,
        message: `Timed out waiting for pending confirmation: ${toolNameOrDisplayName || 'any'}. Current pending: ${this.getPendingConfirmations()
          .map((p) => p.toolName)
          .join(', ')}`,
      },
    );

    this.lastAwaitedConfirmation = matched;
    return matched!;
  }

  async resolveTool(
    toolNameOrDisplayName: string | RegExp | PendingConfirmation,
    outcome: ToolConfirmationOutcome = ToolConfirmationOutcome.ProceedOnce,
  ): Promise<void> {
    if (!this.config) throw new Error('AppRig not initialized');
    const messageBus = this.config.getMessageBus();

    let pending: PendingConfirmation;
    if (
      typeof toolNameOrDisplayName === 'object' &&
      'correlationId' in toolNameOrDisplayName
    ) {
      pending = toolNameOrDisplayName;
    } else {
      pending = await this.waitForPendingConfirmation(toolNameOrDisplayName);
    }

    await act(async () => {
      this.pendingConfirmations.delete(pending.correlationId);

      if (this.breakpointTools.has(pending.toolName)) {
        this.removeToolPolicy(pending.toolName);
      }

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      messageBus.publish({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: pending.correlationId,
        confirmed: outcome !== ToolConfirmationOutcome.Cancel,
        outcome,
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  }

  async resolveAwaitedTool(
    outcome: ToolConfirmationOutcome = ToolConfirmationOutcome.ProceedOnce,
  ): Promise<void> {
    if (!this.lastAwaitedConfirmation) {
      throw new Error('No tool has been awaited yet');
    }
    await this.resolveTool(this.lastAwaitedConfirmation, outcome);
    this.lastAwaitedConfirmation = undefined;
  }

  async addUserHint(hint: string) {
    if (!this.config) throw new Error('AppRig not initialized');
    await act(async () => {
      this.config!.userHintService.addUserHint(hint);
    });
  }

  getConfig(): Config {
    if (!this.config) throw new Error('AppRig not initialized');
    return this.config;
  }

  async type(text: string) {
    if (!this.renderResult) throw new Error('AppRig not initialized');
    await act(async () => {
      this.renderResult!.stdin.write(text);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }

  async pressEnter() {
    await this.type('\r');
  }

  async pressKey(key: string) {
    if (!this.renderResult) throw new Error('AppRig not initialized');
    await act(async () => {
      this.renderResult!.stdin.write(key);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }

  get lastFrame() {
    if (!this.renderResult) return '';
    return stripAnsi(this.renderResult.lastFrame({ allowEmpty: true }) || '');
  }

  getStaticOutput() {
    if (!this.renderResult) return '';
    return stripAnsi(this.renderResult.stdout.lastFrame() || '');
  }

  async waitForOutput(pattern: string | RegExp, timeout = 30000) {
    await this.waitUntil(
      () => {
        const frame = this.lastFrame;
        return typeof pattern === 'string'
          ? frame.includes(pattern)
          : pattern.test(frame);
      },
      {
        timeout,
        message: `Timed out waiting for output: ${pattern}\nLast frame:\n${this.lastFrame}`,
      },
    );
  }

  async waitForIdle(timeout = 20000) {
    await this.waitForOutput('Type your message', timeout);
  }

  async sendMessage(text: string) {
    await this.type(text);
    await this.pressEnter();
  }

  async unmount() {
    // Poison the chat recording service to prevent late writes to the test directory
    if (this.config) {
      const recordingService = this.config
        .getGeminiClient()
        ?.getChatRecordingService();
      if (recordingService) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
        (recordingService as any).conversationFile = null;
      }
    }

    if (this.renderResult) {
      this.renderResult.unmount();
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    vi.unstubAllEnvs();

    coreEvents.removeAllListeners();
    coreEvents.drainBacklogs();
    MockShellExecutionService.reset();
    ideContextStore.clear();
    // Forcefully clear IdeClient singleton promise
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
    (IdeClient as any).instancePromise = null;
    vi.clearAllMocks();

    this.config = undefined;
    this.renderResult = undefined;

    if (this.testDir && fs.existsSync(this.testDir)) {
      try {
        fs.rmSync(this.testDir, { recursive: true, force: true });
      } catch (e) {
        debugLogger.warn(
          `Failed to cleanup test directory ${this.testDir}:`,
          e,
        );
      }
    }
  }
}
