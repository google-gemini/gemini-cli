/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type EvalPolicy,
  runEval,
  prepareLogDir,
  withEvalRetries,
  prepareWorkspace,
  type BaseEvalCase,
} from './test-helper.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import {
  Config,
  type ConfigParameters,
  AuthType,
  ApprovalMode,
  createPolicyEngineConfig,
  ExtensionLoader,
  IntegrityDataStatus,
  makeFakeConfig,
  type GeminiCLIExtension,
} from '@google/gemini-cli-core';
import { createMockSettings } from '../packages/cli/src/test-utils/settings.js';

// A minimal mock ExtensionManager to bypass integrity checks
class MockExtensionManager extends ExtensionLoader {
  override getExtensions(): GeminiCLIExtension[] {
    return [];
  }
  setRequestConsent = (): void => {};
  setRequestSetting = (): void => {};
  integrityManager = {
    verifyExtensionIntegrity: async (): Promise<IntegrityDataStatus> =>
      IntegrityDataStatus.VERIFIED,
    storeExtensionIntegrity: async (): Promise<void> => undefined,
  };
}

export interface ComponentEvalCase extends BaseEvalCase {
  configOverrides?: Partial<ConfigParameters>;
  setup?: (config: Config) => Promise<void>;
  assert: (config: Config) => Promise<void>;
}

export class ComponentRig {
  public config: Config | undefined;
  public testDir: string;
  public homeDir: string;
  public sessionId: string;

  constructor(
    private options: { configOverrides?: Partial<ConfigParameters> } = {},
  ) {
    const uniqueId = randomUUID();
    this.testDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `gemini-component-rig-${uniqueId.slice(0, 8)}-`),
    );
    this.homeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `gemini-component-home-${uniqueId.slice(0, 8)}-`),
    );
    this.sessionId = `test-session-${uniqueId}`;
  }

  async initialize() {
    const settings = createMockSettings();
    const policyEngineConfig = await createPolicyEngineConfig(
      settings.merged,
      ApprovalMode.DEFAULT,
    );

    const configParams: ConfigParameters = {
      sessionId: this.sessionId,
      targetDir: this.testDir,
      cwd: this.testDir,
      debugMode: false,
      model: 'test-model',
      interactive: false,
      approvalMode: ApprovalMode.DEFAULT,
      policyEngineConfig,
      enableEventDrivenScheduler: false, // Don't need scheduler for direct component tests
      extensionLoader: new MockExtensionManager(),
      useAlternateBuffer: false,
      ...this.options.configOverrides,
    };

    this.config = makeFakeConfig(configParams);
    await this.config.initialize();

    // Refresh auth using USE_GEMINI to initialize the real BaseLlmClient.
    // This must happen BEFORE stubbing GEMINI_CLI_HOME because OAuth credential
    // lookup resolves through homedir() → GEMINI_CLI_HOME.
    await this.config.refreshAuth(AuthType.USE_GEMINI);

    // Isolate storage paths (session files, skills, extraction state) by
    // pointing GEMINI_CLI_HOME at a per-test temp directory.  Storage resolves
    // global paths through `homedir()` which reads this env var.  This is set
    // after auth so credential lookup uses the real home directory.
    vi.stubEnv('GEMINI_CLI_HOME', this.homeDir);
  }

  async cleanup() {
    await this.config?.dispose();
    vi.unstubAllEnvs();
    fs.rmSync(this.testDir, { recursive: true, force: true });
    fs.rmSync(this.homeDir, { recursive: true, force: true });
  }
}

/**
 * A helper for running behavioral evaluations directly against backend components.
 * It provides a fully initialized Config with real API access, bypassing the UI.
 */
export function componentEvalTest(
  policy: EvalPolicy,
  evalCase: ComponentEvalCase,
) {
  const fn = async () => {
    await withEvalRetries(evalCase.name, async () => {
      const rig = new ComponentRig({
        configOverrides: evalCase.configOverrides,
      });

      await prepareLogDir(evalCase.name);

      try {
        await rig.initialize();

        if (evalCase.files) {
          await prepareWorkspace(rig.testDir, rig.testDir, evalCase.files);
        }

        if (evalCase.setup) {
          await evalCase.setup(rig.config!);
        }

        await evalCase.assert(rig.config!);
      } finally {
        await rig.cleanup();
      }
    });
  };

  runEval(policy, evalCase, fn, (evalCase.timeout ?? 60000) + 10000);
}
