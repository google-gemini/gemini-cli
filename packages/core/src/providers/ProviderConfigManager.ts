/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModelProviderConfig } from './types.js';
import { ModelProviderType } from './types.js';
import type { Config } from '../config/config.js';

export class ProviderConfigManager {
  private providerConfigs: Map<string, ModelProviderConfig> = new Map();

  constructor(private config: Config) {    
    this.loadProviderConfigs();
  }

  getProviderConfig(type: ModelProviderType): ModelProviderConfig | undefined {
    return this.providerConfigs.get(type);
  }

  setProviderConfig(config: ModelProviderConfig): void {
    this.providerConfigs.set(config.type, {
      ...config,
      lastUsed: new Date()
    });
  }

  getAllProviderConfigs(): ModelProviderConfig[] {
    return Array.from(this.providerConfigs.values()).sort((a, b) => {
      if (a.isDefault !== b.isDefault) {
        return a.isDefault ? -1 : 1;
      }
      if (a.lastUsed && b.lastUsed) {
        return b.lastUsed.getTime() - a.lastUsed.getTime();
      }
      return a.type.localeCompare(b.type);
    });
  }

  getDefaultProviderConfig(): ModelProviderConfig | undefined {
    return this.getAllProviderConfigs().find(config => config.isDefault) ||
           this.getAllProviderConfigs()[0];
  }

  setDefaultProvider(type: ModelProviderType): void {
    this.providerConfigs.forEach(config => {
      config.isDefault = config.type === type;
    });
  }

  hasProviderConfig(type: ModelProviderType): boolean {
    return this.providerConfigs.has(type);
  }

  removeProviderConfig(type: ModelProviderType): boolean {
    return this.providerConfigs.delete(type);
  }

  getConfig(): Config {
    return this.config;
  }

  private loadProviderConfigs(): void {
    // 设置 Gemini 配置（非默认）
    // Note: API keys are now managed by AuthManager, not stored in provider configs
    const geminiConfig: ModelProviderConfig = {
      type: ModelProviderType.GEMINI,
      model: 'gemini-2.5-flash',
      isDefault: false,
      displayName: 'Google Gemini'
    };
    this.providerConfigs.set(ModelProviderType.GEMINI, geminiConfig);

    // OpenAI configuration (API key managed by AuthManager)
    const openaiConfig: ModelProviderConfig = {
      type: ModelProviderType.OPENAI,
      model: 'gpt-4',
      displayName: 'OpenAI GPT'
    };
    this.providerConfigs.set(ModelProviderType.OPENAI, openaiConfig);

    // 设置 LM Studio 为默认提供商
    const lmStudioUrl = process.env['LM_STUDIO_URL'] || 'http://127.0.0.1:1234/v1';
    const lmStudioConfig: ModelProviderConfig = {
      type: ModelProviderType.LM_STUDIO,
      baseUrl: lmStudioUrl,
      model: 'openai/gpt-oss-20b', // 默认模型
      displayName: 'LM Studio',
      isDefault: true // 设置为默认提供商
    };
    this.providerConfigs.set(ModelProviderType.LM_STUDIO, lmStudioConfig);
  }
}