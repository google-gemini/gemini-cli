/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { retryConfigManager } from '@google/gemini-cli-core';

/**
 * CLI command to manage retry configuration settings
 */
export function handleRetryConfigCommand(args: string[]): void {
  const [subcommand, ...params] = args;

  switch (subcommand) {
    case 'show':
    case 'status':
      showRetryConfig();
      break;
    
    case 'set':
      setRetryConfig(params);
      break;
    
    case 'reset':
      resetRetryConfig();
      break;
    
    case 'example':
      createExampleConfig();
      break;
    
    case 'validate':
      validateRetryConfig();
      break;
    
    default:
      showRetryConfigHelp();
      break;
  }
}

/**
 * Display current retry configuration
 */
function showRetryConfig(): void {
  console.log(retryConfigManager.getConfigSummary());
}

/**
 * Set retry configuration values
 */
function setRetryConfig(params: string[]): void {
  if (params.length < 2) {
    console.error('Usage: /retry-config set <key> <value>');
    console.error('Example: /retry-config set maxRetries 3');
    return;
  }

  const [key, value] = params;
  const config = retryConfigManager.getConfig();

  try {
    // Parse value based on key type
    let parsedValue: any;
    
    switch (key) {
      case 'maxRetries':
      case 'baseDelayMs':
      case 'maxDelayMs':
        parsedValue = parseInt(value, 10);
        if (isNaN(parsedValue)) {
          throw new Error(`Invalid number: ${value}`);
        }
        break;
      
      case 'enableDebugLogging':
      case 'verboseRetries':
        parsedValue = value.toLowerCase() === 'true';
        break;
      
      case 'rateLimitBackoff':
      case 'serverErrorBackoff':
      case 'networkErrorBackoff':
        if (!['exponential', 'linear', 'aggressive'].includes(value)) {
          throw new Error(`Invalid strategy: ${value}. Must be exponential, linear, or aggressive`);
        }
        parsedValue = value;
        break;
      
      default:
        throw new Error(`Unknown configuration key: ${key}`);
    }

    // Update configuration
    const updates: any = {};
    if (key.includes('Backoff')) {
      updates.retryStrategies = { ...config.retryStrategies };
      updates.retryStrategies[key] = parsedValue;
    } else {
      updates[key] = parsedValue;
    }

    retryConfigManager.updateConfig(updates);
    console.log(`[+] Updated ${key} to ${parsedValue}`);
    
    // Validate the new configuration
    const errors = retryConfigManager.validateConfig();
    if (errors.length > 0) {
      console.warn('[!] Configuration warnings:');
      errors.forEach(error => console.warn(`  - ${error}`));
    }
    
  } catch (error) {
    console.error(`[X] Failed to set ${key}: ${error}`);
  }
}

/**
 * Reset retry configuration to defaults
 */
function resetRetryConfig(): void {
  retryConfigManager.resetToDefaults();
  console.log('[+] Retry configuration reset to defaults');
  showRetryConfig();
}

/**
 * Create example configuration file
 */
function createExampleConfig(): void {
  retryConfigManager.createExampleConfig();
}

/**
 * Validate current retry configuration
 */
function validateRetryConfig(): void {
  const errors = retryConfigManager.validateConfig();
  
  if (errors.length === 0) {
    console.log('[+] Retry configuration is valid');
  } else {
    console.error('[X] Configuration validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
    process.exit(1);
  }
}

/**
 * Show help for retry configuration commands
 */
function showRetryConfigHelp(): void {
  console.log(`
Retry Configuration Commands:

  /retry-config show              Show current retry settings
  /retry-config set <key> <value> Update a configuration value
  /retry-config reset             Reset to default settings
  /retry-config example           Create example configuration file
  /retry-config validate          Validate current configuration

Configuration Keys:
  maxRetries                      Maximum retry attempts (0-10)
  baseDelayMs                     Base delay in milliseconds
  maxDelayMs                      Maximum delay in milliseconds
  enableDebugLogging              Enable debug logging (true/false)
  verboseRetries                  Show verbose retry info (true/false)
  rateLimitBackoff                Strategy for 429 errors (exponential/linear/aggressive)
  serverErrorBackoff              Strategy for 5xx errors (exponential/linear)
  networkErrorBackoff             Strategy for network errors (exponential/linear)

Examples:
  /retry-config set maxRetries 3
  /retry-config set baseDelayMs 2000
  /retry-config set verboseRetries true
  /retry-config set rateLimitBackoff aggressive

Configuration File:
  ~/.gemini/retry-settings.json
  `.trim());
}
