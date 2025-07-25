/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeminiClient } from '../subagents/geminiClient.js';

export interface LoadBalancerEndpoint {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  weight: number;
  isActive: boolean;
  healthCheckUrl?: string;
  maxConcurrentRequests: number;
  currentRequests: number;
  lastHealthCheck: number;
  lastResponseTime: number;
  errorCount: number;
  successCount: number;
}

export interface LoadBalancerConfig {
  endpoints: LoadBalancerEndpoint[];
  algorithm: 'round-robin' | 'least-connections' | 'weighted' | 'ip-hash';
  healthCheckInterval: number; // milliseconds
  healthCheckTimeout: number; // milliseconds
  maxRetries: number;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number; // milliseconds
}

export interface LoadBalancerStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  activeEndpoints: number;
  totalEndpoints: number;
}

export class LoadBalancerService {
  private config: LoadBalancerConfig;
  private currentIndex: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private clientIpMap: Map<string, number> = new Map();

  constructor(config: LoadBalancerConfig) {
    this.config = config;
    this.startHealthChecks();
  }

  /**
   * 利用可能なエンドポイントを取得
   */
  private getAvailableEndpoints(): LoadBalancerEndpoint[] {
    return this.config.endpoints.filter(endpoint => 
      endpoint.isActive && 
      endpoint.errorCount < this.config.circuitBreakerThreshold
    );
  }

  /**
   * Round Robin アルゴリズム
   */
  private selectRoundRobin(): LoadBalancerEndpoint | null {
    const availableEndpoints = this.getAvailableEndpoints();
    if (availableEndpoints.length === 0) return null;

    const endpoint = availableEndpoints[this.currentIndex % availableEndpoints.length];
    this.currentIndex = (this.currentIndex + 1) % availableEndpoints.length;
    return endpoint;
  }

  /**
   * Least Connections アルゴリズム
   */
  private selectLeastConnections(): LoadBalancerEndpoint | null {
    const availableEndpoints = this.getAvailableEndpoints();
    if (availableEndpoints.length === 0) return null;

    return availableEndpoints.reduce((min, current) => 
      current.currentRequests < min.currentRequests ? current : min
    );
  }

  /**
   * Weighted Round Robin アルゴリズム
   */
  private selectWeighted(): LoadBalancerEndpoint | null {
    const availableEndpoints = this.getAvailableEndpoints();
    if (availableEndpoints.length === 0) return null;

    const totalWeight = availableEndpoints.reduce((sum, endpoint) => sum + endpoint.weight, 0);
    let random = Math.random() * totalWeight;

    for (const endpoint of availableEndpoints) {
      random -= endpoint.weight;
      if (random <= 0) {
        return endpoint;
      }
    }

    return availableEndpoints[0]; // fallback
  }

  /**
   * IP Hash アルゴリズム
   */
  private selectIpHash(clientIp: string): LoadBalancerEndpoint | null {
    const availableEndpoints = this.getAvailableEndpoints();
    if (availableEndpoints.length === 0) return null;

    const hash = this.hashString(clientIp);
    return availableEndpoints[hash % availableEndpoints.length];
  }

  /**
   * 文字列のハッシュ値を計算
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * エンドポイントを選択
   */
  public selectEndpoint(clientIp?: string): LoadBalancerEndpoint | null {
    switch (this.config.algorithm) {
      case 'round-robin':
        return this.selectRoundRobin();
      case 'least-connections':
        return this.selectLeastConnections();
      case 'weighted':
        return this.selectWeighted();
      case 'ip-hash':
        return clientIp ? this.selectIpHash(clientIp) : this.selectRoundRobin();
      default:
        return this.selectRoundRobin();
    }
  }

  /**
   * リクエストを実行
   */
  public async executeRequest(
    prompt: string,
    options: {
      maxTokens?: number;
      temperature?: number;
      clientIp?: string;
    } = {}
  ): Promise<{
    response: string;
    endpoint: LoadBalancerEndpoint;
    responseTime: number;
    tokensUsed?: number;
  }> {
    const endpoint = this.selectEndpoint(options.clientIp);
    if (!endpoint) {
      throw new Error('利用可能なエンドポイントがありません');
    }

    // リクエスト数を増加
    endpoint.currentRequests++;

    const startTime = Date.now();
    let success = false;

    try {
      const client = new GeminiClient({
        apiKey: endpoint.apiKey,
        baseUrl: endpoint.url
      });
      const response = await client.executeSubagentTask(
        { 
          id: 'load-balancer', 
          name: 'Load Balancer', 
          specialty: 'custom',
          description: 'ロードバランサー用の汎用AIアシスタント',
          prompt: '',
          maxTokens: 4000,
          temperature: 0.7,
          status: 'idle',
          createdAt: new Date().toISOString(),
          taskHistory: [],
          customTools: [],
          isActive: true
        },
        prompt,
        '',
        {
          maxTokens: options.maxTokens || 4096,
          temperature: options.temperature || 0.7
        }
      );

      const responseTime = Date.now() - startTime;
      endpoint.lastResponseTime = responseTime;
      endpoint.successCount++;
      success = true;

      return {
        response: response.text,
        endpoint,
        responseTime,
        tokensUsed: response.tokensUsed
      };

    } catch (error) {
      endpoint.errorCount++;
      throw error;
    } finally {
      // リクエスト数を減少
      endpoint.currentRequests--;
      
      if (!success) {
        // エラーが閾値を超えた場合、エンドポイントを一時的に無効化
        if (endpoint.errorCount >= this.config.circuitBreakerThreshold) {
          this.disableEndpoint(endpoint.id);
          setTimeout(() => {
            this.enableEndpoint(endpoint.id);
          }, this.config.circuitBreakerTimeout);
        }
      }
    }
  }

  /**
   * ヘルスチェックを開始
   */
  private startHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  /**
   * ヘルスチェックを実行
   */
  private async performHealthChecks(): Promise<void> {
    const promises = this.config.endpoints.map(async (endpoint) => {
      if (!endpoint.healthCheckUrl) return;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.healthCheckTimeout);

        const response = await fetch(endpoint.healthCheckUrl, {
          method: 'GET',
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          endpoint.lastHealthCheck = Date.now();
          if (!endpoint.isActive) {
            endpoint.isActive = true;
            console.log(`✅ エンドポイント ${endpoint.name} が復旧しました`);
          }
        } else {
          this.disableEndpoint(endpoint.id);
        }
      } catch (error) {
        this.disableEndpoint(endpoint.id);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * エンドポイントを無効化
   */
  private disableEndpoint(endpointId: string): void {
    const endpoint = this.config.endpoints.find(e => e.id === endpointId);
    if (endpoint && endpoint.isActive) {
      endpoint.isActive = false;
      console.log(`❌ エンドポイント ${endpoint.name} が無効化されました`);
    }
  }

  /**
   * エンドポイントを有効化
   */
  private enableEndpoint(endpointId: string): void {
    const endpoint = this.config.endpoints.find(e => e.id === endpointId);
    if (endpoint && !endpoint.isActive) {
      endpoint.isActive = true;
      endpoint.errorCount = 0;
      console.log(`✅ エンドポイント ${endpoint.name} が有効化されました`);
    }
  }

  /**
   * 統計情報を取得
   */
  public getStats(): LoadBalancerStats {
    const activeEndpoints = this.getAvailableEndpoints();
    const totalRequests = this.config.endpoints.reduce((sum, e) => sum + e.successCount + e.errorCount, 0);
    const successfulRequests = this.config.endpoints.reduce((sum, e) => sum + e.successCount, 0);
    const failedRequests = this.config.endpoints.reduce((sum, e) => sum + e.errorCount, 0);
    
    const totalResponseTime = this.config.endpoints.reduce((sum, e) => sum + e.lastResponseTime, 0);
    const averageResponseTime = activeEndpoints.length > 0 ? totalResponseTime / activeEndpoints.length : 0;

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime,
      activeEndpoints: activeEndpoints.length,
      totalEndpoints: this.config.endpoints.length
    };
  }

  /**
   * 設定を更新
   */
  public updateConfig(newConfig: Partial<LoadBalancerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.startHealthChecks();
  }

  /**
   * エンドポイントを追加
   */
  public addEndpoint(endpoint: LoadBalancerEndpoint): void {
    this.config.endpoints.push(endpoint);
  }

  /**
   * エンドポイントを削除
   */
  public removeEndpoint(endpointId: string): boolean {
    const index = this.config.endpoints.findIndex(e => e.id === endpointId);
    if (index !== -1) {
      this.config.endpoints.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * サービスを停止
   */
  public destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
} 