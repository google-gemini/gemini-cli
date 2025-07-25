/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { LoadBalancerConfig, LoadBalancerEndpoint } from '../services/loadBalancerService.js';

const CONFIG_FILE = 'loadBalancer.json';

export interface LoadBalancerConfigFile {
  version: string;
  config: LoadBalancerConfig;
  lastUpdated: string;
}

/**
 * デフォルト設定を取得
 */
export function getDefaultLoadBalancerConfig(): LoadBalancerConfig {
  return {
    endpoints: [],
    algorithm: 'round-robin',
    healthCheckInterval: 30000, // 30秒
    healthCheckTimeout: 5000,   // 5秒
    maxRetries: 3,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 60000 // 1分
  };
}

/**
 * デフォルトエンドポイントを作成
 */
export function createDefaultEndpoint(
  name: string,
  apiKey: string,
  url: string = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent'
): LoadBalancerEndpoint {
  return {
    id: generateEndpointId(),
    name,
    url,
    apiKey,
    weight: 1,
    isActive: true,
    healthCheckUrl: undefined,
    maxConcurrentRequests: 10,
    currentRequests: 0,
    lastHealthCheck: Date.now(),
    lastResponseTime: 0,
    errorCount: 0,
    successCount: 0
  };
}

/**
 * エンドポイントIDを生成
 */
function generateEndpointId(): string {
  return `endpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 設定ファイルのパスを取得
 */
function getConfigFilePath(): string {
  const configDir = process.env.GEMINI_CLI_CONFIG_DIR || join(process.cwd(), '.gemini');
  return join(configDir, CONFIG_FILE);
}

/**
 * 設定ディレクトリを作成
 */
async function ensureConfigDirectory(): Promise<void> {
  const configPath = getConfigFilePath();
  const configDir = dirname(configPath);
  
  try {
    await fs.access(configDir);
  } catch {
    await fs.mkdir(configDir, { recursive: true });
  }
}

/**
 * ロードバランサー設定を読み込み
 */
export async function readLoadBalancerConfig(): Promise<LoadBalancerConfig> {
  try {
    const configPath = getConfigFilePath();
    const data = await fs.readFile(configPath, 'utf-8');
    const configFile: LoadBalancerConfigFile = JSON.parse(data);
    
    // バージョン互換性チェック
    if (configFile.version !== '1.0.0') {
      console.warn('⚠️ 設定ファイルのバージョンが古いため、デフォルト設定を使用します');
      return getDefaultLoadBalancerConfig();
    }
    
    return configFile.config;
  } catch (error) {
    // ファイルが存在しない場合はデフォルト設定を返す
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return getDefaultLoadBalancerConfig();
    }
    throw error;
  }
}

/**
 * ロードバランサー設定を保存
 */
export async function writeLoadBalancerConfig(config: LoadBalancerConfig): Promise<void> {
  await ensureConfigDirectory();
  
  const configFile: LoadBalancerConfigFile = {
    version: '1.0.0',
    config,
    lastUpdated: new Date().toISOString()
  };
  
  const configPath = getConfigFilePath();
  await fs.writeFile(configPath, JSON.stringify(configFile, null, 2), 'utf-8');
}

/**
 * 設定を検証
 */
export function validateLoadBalancerConfig(config: LoadBalancerConfig): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // アルゴリズムの検証
  const validAlgorithms = ['round-robin', 'least-connections', 'weighted', 'ip-hash'];
  if (!validAlgorithms.includes(config.algorithm)) {
    errors.push(`無効なアルゴリズム: ${config.algorithm}`);
  }
  
  // エンドポイントの検証
  if (config.endpoints.length === 0) {
    errors.push('少なくとも1つのエンドポイントが必要です');
  }
  
  for (const endpoint of config.endpoints) {
    if (!endpoint.id || !endpoint.name || !endpoint.url || !endpoint.apiKey) {
      errors.push(`エンドポイント ${endpoint.name || endpoint.id} の必須フィールドが不足しています`);
    }
    
    if (endpoint.weight <= 0) {
      errors.push(`エンドポイント ${endpoint.name} の重みは0より大きい必要があります`);
    }
    
    if (endpoint.maxConcurrentRequests <= 0) {
      errors.push(`エンドポイント ${endpoint.name} の最大同時リクエスト数は0より大きい必要があります`);
    }
  }
  
  // タイムアウト値の検証
  if (config.healthCheckInterval <= 0) {
    errors.push('ヘルスチェック間隔は0より大きい必要があります');
  }
  
  if (config.healthCheckTimeout <= 0) {
    errors.push('ヘルスチェックタイムアウトは0より大きい必要があります');
  }
  
  if (config.circuitBreakerTimeout <= 0) {
    errors.push('サーキットブレーカータイムアウトは0より大きい必要があります');
  }
  
  if (config.maxRetries < 0) {
    errors.push('最大リトライ数は0以上である必要があります');
  }
  
  if (config.circuitBreakerThreshold <= 0) {
    errors.push('サーキットブレーカー閾値は0より大きい必要があります');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * エンドポイントを追加
 */
export async function addLoadBalancerEndpoint(endpoint: LoadBalancerEndpoint): Promise<void> {
  const config = await readLoadBalancerConfig();
  
  // 既存のエンドポイントとの重複チェック
  const existingEndpoint = config.endpoints.find(e => e.id === endpoint.id);
  if (existingEndpoint) {
    throw new Error(`エンドポイントID ${endpoint.id} は既に存在します`);
  }
  
  config.endpoints.push(endpoint);
  
  const validation = validateLoadBalancerConfig(config);
  if (!validation.isValid) {
    throw new Error(`設定が無効です: ${validation.errors.join(', ')}`);
  }
  
  await writeLoadBalancerConfig(config);
}

/**
 * エンドポイントを削除
 */
export async function removeLoadBalancerEndpoint(endpointId: string): Promise<boolean> {
  const config = await readLoadBalancerConfig();
  const index = config.endpoints.findIndex(e => e.id === endpointId);
  
  if (index === -1) {
    return false;
  }
  
  config.endpoints.splice(index, 1);
  
  const validation = validateLoadBalancerConfig(config);
  if (!validation.isValid) {
    throw new Error(`設定が無効です: ${validation.errors.join(', ')}`);
  }
  
  await writeLoadBalancerConfig(config);
  return true;
}

/**
 * エンドポイントを更新
 */
export async function updateLoadBalancerEndpoint(
  endpointId: string,
  updates: Partial<LoadBalancerEndpoint>
): Promise<void> {
  const config = await readLoadBalancerConfig();
  const endpoint = config.endpoints.find(e => e.id === endpointId);
  
  if (!endpoint) {
    throw new Error(`エンドポイント ${endpointId} が見つかりません`);
  }
  
  Object.assign(endpoint, updates);
  
  const validation = validateLoadBalancerConfig(config);
  if (!validation.isValid) {
    throw new Error(`設定が無効です: ${validation.errors.join(', ')}`);
  }
  
  await writeLoadBalancerConfig(config);
}

/**
 * アルゴリズムを更新
 */
export async function updateLoadBalancerAlgorithm(algorithm: LoadBalancerConfig['algorithm']): Promise<void> {
  const config = await readLoadBalancerConfig();
  config.algorithm = algorithm;
  
  const validation = validateLoadBalancerConfig(config);
  if (!validation.isValid) {
    throw new Error(`設定が無効です: ${validation.errors.join(', ')}`);
  }
  
  await writeLoadBalancerConfig(config);
}

/**
 * 設定をリセット
 */
export async function resetLoadBalancerConfig(): Promise<void> {
  const defaultConfig = getDefaultLoadBalancerConfig();
  await writeLoadBalancerConfig(defaultConfig);
}

/**
 * 設定ファイルの存在確認
 */
export async function loadBalancerConfigExists(): Promise<boolean> {
  try {
    const configPath = getConfigFilePath();
    await fs.access(configPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 設定ファイルを削除
 */
export async function deleteLoadBalancerConfig(): Promise<void> {
  try {
    const configPath = getConfigFilePath();
    await fs.unlink(configPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
} 