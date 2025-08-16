/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface RetryConfiguration {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  enableDebugLogging: boolean;
  verboseRetries: boolean;
  retryStrategies: {
    rateLimitBackoff: 'exponential' | 'linear' | 'aggressive';
    serverErrorBackoff: 'exponential' | 'linear';
    networkErrorBackoff: 'exponential' | 'linear';
  };
  customDelays: {
    rateLimit: number[];
    serverError: number[];
    networkError: number[];
  };
}

const DEFAULT_RETRY_CONFIG: RetryConfiguration = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  enableDebugLogging: true,
  verboseRetries: false,
  retryStrategies: {
    rateLimitBackoff: 'exponential',
    serverErrorBackoff: 'linear',
    networkErrorBackoff: 'linear',
  },
  customDelays: {
    rateLimit: [1000, 2000, 4000, 8000, 16000], // Exponential for 429s
    serverError: [2000, 4000, 6000], // Linear for 5xx
    networkError: [500, 1000, 2000], // Quick retry for network issues
  },
};

/**
 * Manages retry configuration for the Gemini CLI
 * Allows users to customize retry behavior via settings file
 */
export class RetryConfigManager {
  private configPath: string;
  private config: RetryConfiguration;

  constructor(configDir?: string) {
    const baseDir = configDir || join(homedir(), '.gemini');
    this.configPath = join(baseDir, 'retry-settings.json');
    this.config = this.loadConfig();
  }

  /**
   * Load retry configuration from file or use defaults
   */
  private loadConfig(): RetryConfiguration {
    try {
      if (existsSync(this.configPath)) {
        const fileContent = readFileSync(this.configPath, 'utf-8');
        const userConfig = JSON.parse(fileContent);
        
        // Merge user config with defaults to handle partial configurations
        return this.mergeConfigs(DEFAULT_RETRY_CONFIG, userConfig);
      }
    } catch (error) {
      console.warn(`Failed to load retry configuration: ${error}. Using defaults.`);
    }
    
    return { ...DEFAULT_RETRY_CONFIG };
  }

  /**
   * Deep merge user configuration with defaults
   */
  private mergeConfigs(defaults: RetryConfiguration, user: Partial<RetryConfiguration>): RetryConfiguration {
    return {
      maxRetries: user.maxRetries ?? defaults.maxRetries,
      baseDelayMs: user.baseDelayMs ?? defaults.baseDelayMs,
      maxDelayMs: user.maxDelayMs ?? defaults.maxDelayMs,
      enableDebugLogging: user.enableDebugLogging ?? defaults.enableDebugLogging,
      verboseRetries: user.verboseRetries ?? defaults.verboseRetries,
      retryStrategies: {
        rateLimitBackoff: user.retryStrategies?.rateLimitBackoff ?? defaults.retryStrategies.rateLimitBackoff,
        serverErrorBackoff: user.retryStrategies?.serverErrorBackoff ?? defaults.retryStrategies.serverErrorBackoff,
        networkErrorBackoff: user.retryStrategies?.networkErrorBackoff ?? defaults.retryStrategies.networkErrorBackoff,
      },
      customDelays: {
        rateLimit: user.customDelays?.rateLimit ?? defaults.customDelays.rateLimit,
        serverError: user.customDelays?.serverError ?? defaults.customDelays.serverError,
        networkError: user.customDelays?.networkError ?? defaults.customDelays.networkError,
      },
    };
  }

  /**
   * Get current retry configuration
   */
  getConfig(): RetryConfiguration {
    return { ...this.config };
  }

  /**
   * Update retry configuration and save to file
   */
  updateConfig(updates: Partial<RetryConfiguration>): void {
    this.config = this.mergeConfigs(this.config, updates);
    this.saveConfig();
  }

  /**
   * Save current configuration to file
   */
  private saveConfig(): void {
    try {
      const configJson = JSON.stringify(this.config, null, 2);
      writeFileSync(this.configPath, configJson, 'utf-8');
    } catch (error) {
      console.warn(`Failed to save retry configuration: ${error}`);
    }
  }

  /**
   * Reset configuration to defaults
   */
  resetToDefaults(): void {
    this.config = { ...DEFAULT_RETRY_CONFIG };
    this.saveConfig();
  }

  /**
   * Get delay for specific error type and attempt
   */
  getDelayForError(errorType: 'rateLimit' | 'serverError' | 'networkError', attempt: number): number {
    const customDelays = this.config.customDelays[errorType];
    
    if (customDelays && attempt < customDelays.length) {
      return customDelays[attempt];
    }
    
    // Fall back to strategy-based calculation
    const strategy = this.getStrategyForErrorType(errorType);
    return this.calculateDelayByStrategy(strategy, attempt);
  }

  /**
   * Get retry strategy for error type
   */
  private getStrategyForErrorType(errorType: 'rateLimit' | 'serverError' | 'networkError'): string {
    switch (errorType) {
      case 'rateLimit':
        return this.config.retryStrategies.rateLimitBackoff;
      case 'serverError':
        return this.config.retryStrategies.serverErrorBackoff;
      case 'networkError':
        return this.config.retryStrategies.networkErrorBackoff;
      default:
        return 'linear';
    }
  }

  /**
   * Calculate delay based on strategy
   */
  private calculateDelayByStrategy(strategy: string, attempt: number): number {
    const base = this.config.baseDelayMs;
    const max = this.config.maxDelayMs;
    
    switch (strategy) {
      case 'exponential':
        return Math.min(base * Math.pow(2, attempt), max);
      case 'aggressive':
        // More aggressive exponential for rate limits
        return Math.min(base * Math.pow(3, attempt), max);
      case 'linear':
      default:
        return Math.min(base * (attempt + 1), max);
    }
  }

  /**
   * Create example configuration file for users
   */
  createExampleConfig(): void {
    const exampleConfig = {
      ...DEFAULT_RETRY_CONFIG,
      _comment: "Gemini CLI Retry Configuration",
      _description: {
        maxRetries: "Maximum number of retry attempts (0-10)",
        baseDelayMs: "Base delay in milliseconds for retry calculations",
        maxDelayMs: "Maximum delay between retries in milliseconds",
        enableDebugLogging: "Enable detailed retry logging to .gemini-cli-debug.log",
        verboseRetries: "Show detailed retry information in console",
        retryStrategies: "Backoff strategies: exponential, linear, aggressive",
        customDelays: "Custom delay sequences (overrides strategies if provided)"
      }
    };
    
    const examplePath = this.configPath.replace('.json', '.example.json');
    try {
      writeFileSync(examplePath, JSON.stringify(exampleConfig, null, 2), 'utf-8');
      console.log(`Example retry configuration created at: ${examplePath}`);
    } catch (error) {
      console.warn(`Failed to create example configuration: ${error}`);
    }
  }

  /**
   * Validate configuration values
   */
  validateConfig(): string[] {
    const errors: string[] = [];
    
    if (this.config.maxRetries < 0 || this.config.maxRetries > 10) {
      errors.push('maxRetries must be between 0 and 10');
    }
    
    if (this.config.baseDelayMs < 100 || this.config.baseDelayMs > 10000) {
      errors.push('baseDelayMs must be between 100 and 10000');
    }
    
    if (this.config.maxDelayMs < this.config.baseDelayMs) {
      errors.push('maxDelayMs must be greater than or equal to baseDelayMs');
    }
    
    if (this.config.maxDelayMs > 300000) { // 5 minutes max
      errors.push('maxDelayMs must not exceed 300000 (5 minutes)');
    }
    
    return errors;
  }

  /**
   * Get configuration summary for display
   */
  getConfigSummary(): string {
    const validation = this.validateConfig();
    const status = validation.length === 0 ? 'Valid' : 'Invalid';
    
    return `
Retry Configuration Summary:
  Status: ${status}
  Max Retries: ${this.config.maxRetries}
  Base Delay: ${this.config.baseDelayMs}ms
  Max Delay: ${this.config.maxDelayMs}ms
  Debug Logging: ${this.config.enableDebugLogging ? 'Enabled' : 'Disabled'}
  Verbose Mode: ${this.config.verboseRetries ? 'Enabled' : 'Disabled'}
  
  Strategies:
    Rate Limit: ${this.config.retryStrategies.rateLimitBackoff}
    Server Error: ${this.config.retryStrategies.serverErrorBackoff}
    Network Error: ${this.config.retryStrategies.networkErrorBackoff}
  
  Config File: ${this.configPath}
  ${validation.length > 0 ? `\nValidation Errors:\n  - ${validation.join('\n  - ')}` : ''}
    `.trim();
  }
}

// Export singleton instance for global use
export const retryConfigManager = new RetryConfigManager();
