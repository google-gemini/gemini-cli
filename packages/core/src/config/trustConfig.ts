/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { TrustConfig } from '../trust/types.js';

export const TRUST_CONFIG_DIR = path.join(os.homedir(), '.trustcli');
export const TRUST_CONFIG_FILE = path.join(TRUST_CONFIG_DIR, 'config.json');
export const TRUST_MODELS_DIR = path.join(TRUST_CONFIG_DIR, 'models');

export const DEFAULT_TRUST_CONFIG: TrustConfig = {
  privacy: {
    privacyMode: 'strict',
    auditLogging: false,
    modelVerification: true,
  },
  models: {
    default: 'phi-3.5-mini-instruct',
    directory: TRUST_MODELS_DIR,
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
  ai: {
    preferredBackend: 'ollama',
    fallbackOrder: ['ollama', 'trust-local', 'cloud'],
    enableFallback: true,
    ollama: {
      baseUrl: 'http://localhost:11434',
      defaultModel: 'qwen2.5:1.5b',
      timeout: 60000, // Reduced to 1 minute for faster failures
      keepAlive: '5m', // Keep model loaded for 5 minutes
      maxToolCalls: 3,
      concurrency: 2, // Limit concurrent requests
      temperature: 0.1, // Lower temperature for more consistent results
      numPredict: 1000, // Limit response length for faster generation
    },
    trustLocal: {
      enabled: true,
      gbnfFunctions: true,
    },
    cloud: {
      enabled: false,
      provider: 'google',
    },
  },
};

export class TrustConfiguration {
  private config: TrustConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || TRUST_CONFIG_FILE;
    this.config = { ...DEFAULT_TRUST_CONFIG };
  }

  async initialize(): Promise<void> {
    try {
      // Ensure config directory exists
      await fs.mkdir(TRUST_CONFIG_DIR, { recursive: true });
      await fs.mkdir(TRUST_MODELS_DIR, { recursive: true });

      // Load existing config if it exists
      try {
        const configData = await fs.readFile(this.configPath, 'utf-8');
        const loadedConfig = JSON.parse(configData);
        this.config = { ...DEFAULT_TRUST_CONFIG, ...loadedConfig };
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

  // AI Backend Configuration Methods
  getPreferredBackend(): string {
    return this.config.ai.preferredBackend;
  }

  setPreferredBackend(backend: 'ollama' | 'trust-local' | 'cloud'): void {
    this.config.ai.preferredBackend = backend;
  }

  getFallbackOrder(): string[] {
    return [...this.config.ai.fallbackOrder];
  }

  setFallbackOrder(order: ('ollama' | 'trust-local' | 'cloud')[]): void {
    this.config.ai.fallbackOrder = order;
  }

  isFallbackEnabled(): boolean {
    return this.config.ai.enableFallback;
  }

  setFallbackEnabled(enabled: boolean): void {
    this.config.ai.enableFallback = enabled;
  }

  getOllamaConfig() {
    return { ...this.config.ai.ollama };
  }

  setOllamaConfig(config: Partial<TrustConfig['ai']['ollama']>): void {
    this.config.ai.ollama = { ...this.config.ai.ollama, ...config };
  }

  getTrustLocalConfig() {
    return { ...this.config.ai.trustLocal };
  }

  setTrustLocalConfig(config: Partial<TrustConfig['ai']['trustLocal']>): void {
    this.config.ai.trustLocal = { ...this.config.ai.trustLocal, ...config };
  }

  getCloudConfig() {
    return { ...this.config.ai.cloud };
  }

  setCloudConfig(config: Partial<TrustConfig['ai']['cloud']>): void {
    this.config.ai.cloud = { ...this.config.ai.cloud, ...config };
  }

  isBackendEnabled(backend: 'ollama' | 'trust-local' | 'cloud'): boolean {
    switch (backend) {
      case 'ollama':
        return true; // Ollama is always enabled if available
      case 'trust-local':
        return this.config.ai.trustLocal.enabled;
      case 'cloud':
        return this.config.ai.cloud.enabled;
      default:
        return false;
    }
  }

  setBackendEnabled(backend: 'trust-local' | 'cloud', enabled: boolean): void {
    switch (backend) {
      case 'trust-local':
        this.config.ai.trustLocal.enabled = enabled;
        break;
      case 'cloud':
        this.config.ai.cloud.enabled = enabled;
        break;
    }
  }
}