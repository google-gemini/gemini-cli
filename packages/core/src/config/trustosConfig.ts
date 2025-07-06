/**
 * @license
 * Copyright 2025 Trust Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { TrustConfig } from '../trustos/types.js';

export const TRUSTOS_CONFIG_DIR = path.join(os.homedir(), '.trustcli');
export const TRUSTOS_CONFIG_FILE = path.join(TRUSTOS_CONFIG_DIR, 'config.yaml');
export const TRUSTOS_MODELS_DIR = path.join(TRUSTOS_CONFIG_DIR, 'models');

export const DEFAULT_TRUSTOS_CONFIG: TrustConfig = {
  privacy: {
    privacyMode: 'strict',
    auditLogging: false,
    modelVerification: true,
  },
  models: {
    default: 'phi-3.5-mini-instruct',
    directory: TRUSTOS_MODELS_DIR,
    autoVerify: true,
  },
  inference: {
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 2048,
    stream: true,
  },
  transparency: {
    logPrompts: false,
    logResponses: false,
    showModelInfo: true,
    showPerformanceMetrics: true,
  },
};

export class TrustConfiguration {
  private config: TrustConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || TRUSTOS_CONFIG_FILE;
    this.config = { ...DEFAULT_TRUSTOS_CONFIG };
  }

  async initialize(): Promise<void> {
    try {
      // Ensure config directory exists
      await fs.mkdir(TRUSTOS_CONFIG_DIR, { recursive: true });
      await fs.mkdir(TRUSTOS_MODELS_DIR, { recursive: true });

      // Load existing config if it exists
      try {
        const configData = await fs.readFile(this.configPath, 'utf-8');
        const loadedConfig = JSON.parse(configData);
        this.config = { ...DEFAULT_TRUSTOS_CONFIG, ...loadedConfig };
      } catch (error) {
        // Config file doesn't exist, create it with defaults
        await this.save();
      }
    } catch (error) {
      console.error('Failed to initialize Trust config:', error);
      throw error;
    }
  }

  async save(): Promise<void> {
    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save Trust config:', error);
      throw error;
    }
  }

  get(): TrustConfig {
    return { ...this.config };
  }

  getModelsDirectory(): string {
    return this.config.models.directory;
  }

  getDefaultModel(): string {
    return this.config.models.default;
  }

  setDefaultModel(modelName: string): void {
    this.config.models.default = modelName;
  }

  getPrivacyMode(): 'strict' | 'moderate' | 'open' {
    return this.config.privacy.privacyMode;
  }

  setPrivacyMode(mode: 'strict' | 'moderate' | 'open'): void {
    this.config.privacy.privacyMode = mode;
  }

  getInferenceSettings() {
    return { ...this.config.inference };
  }

  setInferenceSettings(settings: Partial<TrustConfig['inference']>): void {
    this.config.inference = { ...this.config.inference, ...settings };
  }

  isAuditLoggingEnabled(): boolean {
    return this.config.privacy.auditLogging;
  }

  setAuditLogging(enabled: boolean): void {
    this.config.privacy.auditLogging = enabled;
  }

  isModelVerificationEnabled(): boolean {
    return this.config.privacy.modelVerification;
  }

  setModelVerification(enabled: boolean): void {
    this.config.privacy.modelVerification = enabled;
  }

  getTransparencySettings() {
    return { ...this.config.transparency };
  }

  setTransparencySettings(settings: Partial<TrustConfig['transparency']>): void {
    this.config.transparency = { ...this.config.transparency, ...settings };
  }
}