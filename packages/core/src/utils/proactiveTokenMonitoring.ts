/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  TokenManager,
  TokenStatus,
  DEFAULT_TOKEN_CONFIG,
  estimateTokenCount,
} from './tokenErrorHandling.js';
import type { Content } from '@google/genai';

export interface TokenMonitoringConfig {
  readonly warningThreshold: number; // 0.0 to 1.0
  readonly criticalThreshold: number; // 0.0 to 1.0
  readonly checkInterval: number; // milliseconds
  readonly enableProactiveCompression: boolean;
}

export interface TokenUsageAlert {
  readonly level: 'info' | 'warning' | 'critical';
  readonly message: string;
  readonly currentUsage: number;
  readonly maxTokens: number;
  readonly usagePercent: number;
  readonly recommendedAction: string;
}

export type TokenAlertCallback = (alert: TokenUsageAlert) => void;

export class ProactiveTokenMonitor {
  private readonly tokenManager: TokenManager;
  private readonly config: TokenMonitoringConfig;
  private readonly alertCallbacks: TokenAlertCallback[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastAlertLevel: TokenUsageAlert['level'] | null = null;

  constructor(
    tokenManager?: TokenManager,
    config?: Partial<TokenMonitoringConfig>,
  ) {
    this.tokenManager = tokenManager || new TokenManager(DEFAULT_TOKEN_CONFIG);
    this.config = {
      warningThreshold: 0.7,
      criticalThreshold: 0.9,
      checkInterval: 5000, // 5 seconds
      enableProactiveCompression: true,
      ...config,
    };
  }

  /**
   * Add a callback to be notified of token usage alerts
   */
  addAlertCallback(callback: TokenAlertCallback): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Remove an alert callback
   */
  removeAlertCallback(callback: TokenAlertCallback): void {
    const index = this.alertCallbacks.indexOf(callback);
    if (index > -1) {
      this.alertCallbacks.splice(index, 1);
    }
  }

  /**
   * Start proactive monitoring
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {
      return; // Already monitoring
    }

    this.monitoringInterval = setInterval(() => {
      this.checkTokenUsage();
    }, this.config.checkInterval);
  }

  /**
   * Stop proactive monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Check current token usage and trigger alerts if necessary
   */
  checkTokenUsage(): void {
    const currentUsage = this.tokenManager.getCurrentUsage();
    const maxTokens = this.tokenManager.getRemainingCapacity() + currentUsage;
    const usagePercent = currentUsage / maxTokens;

    let alertLevel: TokenUsageAlert['level'] | null = null;
    let message = '';
    let recommendedAction = '';

    if (usagePercent >= this.config.criticalThreshold) {
      alertLevel = 'critical';
      message = `🚨 Token usage has reached dangerous levels!`;
      recommendedAction =
        'Immediately compress context or start a new session.';
    } else if (usagePercent >= this.config.warningThreshold) {
      alertLevel = 'warning';
      message = `⚠️ Token usage is high.`;
      recommendedAction = 'Context compression may be needed soon.';
    } else if (usagePercent >= 0.5) {
      alertLevel = 'info';
      message = `ℹ️ Token usage is at moderate levels.`;
      recommendedAction = 'You can continue using normally.';
    }

    // Only send alert if level changed or it's a critical alert
    if (
      alertLevel &&
      (alertLevel !== this.lastAlertLevel || alertLevel === 'critical')
    ) {
      const alert: TokenUsageAlert = {
        level: alertLevel,
        message,
        currentUsage,
        maxTokens,
        usagePercent: Math.round(usagePercent * 100),
        recommendedAction,
      };

      this.triggerAlert(alert);
      this.lastAlertLevel = alertLevel;
    } else if (!alertLevel) {
      this.lastAlertLevel = null;
    }
  }

  /**
   * Check if content would exceed limits before sending
   */
  checkContentBeforeSend(contents: Content[]): TokenStatus {
    const estimatedTokens = estimateTokenCount(contents);
    return this.tokenManager.checkTokenLimit(estimatedTokens);
  }

  /**
   * Get proactive compression recommendation
   */
  getCompressionRecommendation(): {
    shouldCompress: boolean;
    compressionRatio: number;
    reason: string;
  } {
    const currentUsage = this.tokenManager.getCurrentUsage();
    const maxTokens = this.tokenManager.getRemainingCapacity() + currentUsage;
    const usagePercent = currentUsage / maxTokens;

    if (usagePercent >= this.config.criticalThreshold) {
      return {
        shouldCompress: true,
        compressionRatio: 0.3, // Compress to 30%
        reason: 'Token usage has reached dangerous levels.',
      };
    } else if (usagePercent >= this.config.warningThreshold) {
      return {
        shouldCompress: true,
        compressionRatio: 0.5, // Compress to 50%
        reason: 'Token usage is high, compression recommended.',
      };
    }

    return {
      shouldCompress: false,
      compressionRatio: 1.0,
      reason: 'Token usage is within normal range.',
    };
  }

  /**
   * Get current token usage statistics
   */
  getTokenStatistics(): {
    current: number;
    max: number;
    remaining: number;
    usagePercent: number;
    status: TokenStatus;
    shouldCompress: boolean;
  } {
    const current = this.tokenManager.getCurrentUsage();
    const remaining = this.tokenManager.getRemainingCapacity();
    const max = current + remaining;
    const usagePercent = max > 0 ? current / max : 0;

    return {
      current,
      max,
      remaining,
      usagePercent: Math.round(usagePercent * 100),
      status: this.tokenManager.checkTokenLimit(0),
      shouldCompress: this.tokenManager.shouldCompress(),
    };
  }

  /**
   * Reset monitoring state
   */
  reset(): void {
    this.tokenManager.resetTokenUsage();
    this.lastAlertLevel = null;
  }

  /**
   * Trigger alert to all registered callbacks
   */
  private triggerAlert(alert: TokenUsageAlert): void {
    this.alertCallbacks.forEach((callback) => {
      try {
        callback(alert);
      } catch (error) {
        console.error('Error in token alert callback:', error);
      }
    });
  }

  /**
   * Get the underlying token manager
   */
  getTokenManager(): TokenManager {
    return this.tokenManager;
  }
}

/**
 * Default monitoring configuration
 */
export const DEFAULT_MONITORING_CONFIG: TokenMonitoringConfig = {
  warningThreshold: 0.7,
  criticalThreshold: 0.9,
  checkInterval: 5000,
  enableProactiveCompression: true,
};

/**
 * Create a user-friendly token usage display
 */
export function formatTokenUsage(
  stats: ReturnType<ProactiveTokenMonitor['getTokenStatistics']>,
): string {
  const { current, max, usagePercent, status } = stats;

  let statusIcon = '✅';
  let statusText = 'Normal';

  if (status === TokenStatus.WARNING) {
    statusIcon = '⚠️';
    statusText = 'Warning';
  } else if (status === TokenStatus.LIMIT_EXCEEDED) {
    statusIcon = '🚨';
    statusText = 'Danger';
  }

  return `${statusIcon} Token usage: ${current.toLocaleString()} / ${max.toLocaleString()} (${usagePercent}%) - ${statusText}`;
}

/**
 * Create a progress bar for token usage
 */
export function createTokenUsageProgressBar(
  stats: ReturnType<ProactiveTokenMonitor['getTokenStatistics']>,
): string {
  const { usagePercent } = stats;
  const barLength = 20;
  const filledLength = Math.round((usagePercent / 100) * barLength);

  let bar = '';
  for (let i = 0; i < barLength; i++) {
    if (i < filledLength) {
      if (usagePercent >= 90) {
        bar += '🔴'; // Red for critical
      } else if (usagePercent >= 70) {
        bar += '🟡'; // Yellow for warning
      } else {
        bar += '🟢'; // Green for normal
      }
    } else {
      bar += '⚪'; // Empty
    }
  }

  return `[${bar}] ${usagePercent}%`;
}
