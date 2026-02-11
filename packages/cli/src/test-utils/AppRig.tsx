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
  type PolicyDecision,
  ToolConfirmationOutcome,
  MessageBusType,
  type ToolCallsUpdateMessage,
} from '@google/gemini-cli-core';
import {
  type MockShellCommand,
  MockShellExecutionService,
} from './MockShellExecutionService.js';
import { createMockSettings } from './settings.js';

// Mock core functions globally for tests using AppRig.
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  const { MockShellExecutionService: MockService } = await import(
    './MockShellExecutionService.js'
  );
  return {
    ...original,
    ShellExecutionService: MockService,
  };
});

// A minimal mock ExtensionManager to satisfy AppContainer's forceful cast
class MockExtensionManager extends ExtensionLoader {
  getExtensions = vi.fn().mockReturnValue([]);
  setRequestConsent = vi.fn();
  setRequestSetting = vi.fn();
}

export interface AppRigOptions {
  fakeResponsesPath?: string;
  terminalWidth?: number;
  terminalHeight?: number;
  configOverrides?: Partial<ConfigParameters>;
}

export class AppRig {
  private renderResult: ReturnType<typeof renderWithProviders> | undefined;
  private config: Config | undefined;
  private testDir: string;
  private pendingConfirmations = new Map<
    string,
    { toolName: string; toolDisplayName?: string; correlationId: string }
  >();

  constructor(private options: AppRigOptions = {}) {
    this.testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-app-rig-'));
    // We use fake timers to control all background noise (spinners, inactivity timers)
    vi.useFakeTimers();
  }

  async initialize() {
    // Stub environment variables to avoid interference from developer's machine
    vi.stubEnv('GEMINI_CLI_HOME', this.testDir);
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.stubEnv('GEMINI_DEFAULT_AUTH_TYPE', AuthType.USE_GEMINI);

    // Ensure settings has the auth type set and useExternal is true to bypass dialogs
    const settings = createMockSettings({
      user: {
        path: path.join(this.testDir, '.gemini', 'user_settings.json'),
        settings: {
          security: {
            auth: {
              selectedType: AuthType.USE_GEMINI,
              useExternal: true,
            },
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
        },
      },
    });

    const approvalMode =
      this.options.configOverrides?.approvalMode ?? ApprovalMode.DEFAULT;
    const policyEngineConfig = await createPolicyEngineConfig(
      settings.merged,
      approvalMode,
    );

    const configParams: ConfigParameters = {
      sessionId: 'test-session',
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
      ...this.options.configOverrides,
    };
    this.config = makeFakeConfig(configParams);

    // Track pending confirmations via tool status updates.
    // We ignore TOOL_CONFIRMATION_REQUEST because the event-driven scheduler handles the REAL
    // confirmation via state updates with a different correlationId.
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
            // We can't access correlationId on other statuses, but we can search for it in the map
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

    await act(async () => {
      this.renderResult = renderWithProviders(
        <AppContainer
          config={this.config!}
          version="1.0.0-test"
          initializationResult={{
            authError: null,
            themeError: null,
            shouldOpenAuthDialog: false,
            geminiMdFileCount: 0,
          }}
        />,
        {
          config: this.config!,
          settings,
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

  setToolPolicy(toolName: string, decision: PolicyDecision) {
    if (!this.config) throw new Error('AppRig not initialized');
    this.config.getPolicyEngine().addRule({
      toolName,
      decision,
      priority: 10, // High priority to override settings
      source: 'AppRig Override',
    });
  }

  /**
   * Deterministically resolves a pending tool confirmation by subscribing to the message bus.
   */
  async resolveTool(
    toolNameOrDisplayName: string,
    outcome: ToolConfirmationOutcome = ToolConfirmationOutcome.ProceedOnce,
  ) {
    if (!this.config) throw new Error('AppRig not initialized');
    const messageBus = this.config.getMessageBus();

    // Check if it's already pending
    for (const [
      correlationId,
      pending,
    ] of this.pendingConfirmations.entries()) {
      if (
        pending.toolName === toolNameOrDisplayName ||
        pending.toolDisplayName === toolNameOrDisplayName
      ) {
        this.pendingConfirmations.delete(correlationId);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        messageBus.publish({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId,
          confirmed: outcome !== ToolConfirmationOutcome.Cancel,
          outcome,
        });
        return;
      }
    }

    return new Promise<void>((resolve) => {
      const checkUpdate = (message: ToolCallsUpdateMessage) => {
        for (const call of message.toolCalls) {
          if (call.status === 'awaiting_approval' && call.correlationId) {
            const details = call.confirmationDetails;
            const title = 'title' in details ? details.title : '';
            const toolDisplayName =
              call.tool?.displayName || title.replace(/^Confirm:\s*/, '');
            if (
              call.request.name === toolNameOrDisplayName ||
              toolDisplayName === toolNameOrDisplayName
            ) {
              messageBus.unsubscribe(
                MessageBusType.TOOL_CALLS_UPDATE,
                checkUpdate,
              );
              this.pendingConfirmations.delete(call.correlationId);
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              messageBus.publish({
                type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
                correlationId: call.correlationId,
                confirmed: outcome !== ToolConfirmationOutcome.Cancel,
                outcome,
              });
              resolve();
              return;
            }
          }
        }
      };

      messageBus.subscribe(MessageBusType.TOOL_CALLS_UPDATE, checkUpdate);
    });
  }

  addUserHint(hint: string) {
    if (!this.config) throw new Error('AppRig not initialized');
    this.config.addUserHint(hint);
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
    // With fake timers, we must advance time for React/Ink to process the input
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
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
      await vi.advanceTimersByTimeAsync(50);
    });
  }

  get lastFrame() {
    if (!this.renderResult) return '';
    return stripAnsi(this.renderResult.lastFrame() || '');
  }

  async waitForOutput(pattern: string | RegExp, timeout = 30000) {
    const start = Date.now();
    const interval = 200;

    while (true) {
      const frame = this.lastFrame;
      const matched =
        typeof pattern === 'string'
          ? frame.includes(pattern)
          : pattern.test(frame);
      if (matched) {
        return;
      }

      if (Date.now() - start > timeout) {
        throw new Error(
          `Timed out waiting for output: ${pattern}\nLast frame:\n${frame}`,
        );
      }

      await act(async () => {
        await vi.advanceTimersByTimeAsync(interval);
      });
    }
  }

  async waitForIdle(timeout = 20000) {
    await this.waitForOutput('Type your message', timeout);
  }

  async unmount() {
    if (this.renderResult) {
      this.renderResult.unmount();
    }

    // Give background promises (like steering acks or chat recording) a moment to finish
    // before we yank the rug out from under them by deleting the test directory.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    vi.stubEnv('GEMINI_CLI_HOME', ''); // Use stubEnv to "unset" instead of unstubAll
    vi.useRealTimers();
    try {
      if (fs.existsSync(this.testDir)) {
        fs.rmSync(this.testDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}
