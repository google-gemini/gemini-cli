/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustConfiguration } from '@trust-cli/trust-cli-core';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ConfigCommandArgs {
  action: 'show' | 'set' | 'get' | 'reset' | 'backend' | 'fallback' | 'export' | 'import';
  key?: string;
  value?: string;
  backend?: 'ollama' | 'trust-local' | 'cloud';
  order?: string[];
  file?: string;
  verbose?: boolean;
}

export class ConfigCommandHandler {
  private config: TrustConfiguration;

  constructor() {
    this.config = new TrustConfiguration();
  }

  async initialize(): Promise<void> {
    await this.config.initialize();
  }

  async handleCommand(args: ConfigCommandArgs): Promise<void> {
    await this.initialize();

    switch (args.action) {
      case 'show':
        await this.showConfig(args.verbose);
        break;
      case 'get':
        if (!args.key) {
          throw new Error('Configuration key required for get command');
        }
        await this.getConfig(args.key);
        break;
      case 'set':
        if (!args.key || args.value === undefined) {
          throw new Error('Configuration key and value required for set command');
        }
        await this.setConfig(args.key, args.value);
        break;
      case 'reset':
        await this.resetConfig();
        break;
      case 'backend':
        if (!args.backend) {
          throw new Error('Backend name required for backend command');
        }
        await this.setBackend(args.backend);
        break;
      case 'fallback':
        if (!args.order || args.order.length === 0) {
          throw new Error('Fallback order required for fallback command');
        }
        await this.setFallbackOrder(args.order);
        break;
      case 'export':
        if (!args.file) {
          throw new Error('Export file path required for export command');
        }
        await this.exportConfig(args.file);
        break;
      case 'import':
        if (!args.file) {
          throw new Error('Import file path required for import command');
        }
        await this.importConfig(args.file);
        break;
      default:
        throw new Error(`Unknown config action: ${args.action}`);
    }
  }

  private async showConfig(verbose = false): Promise<void> {
    console.log('\n🛡️  Trust CLI - Configuration');
    console.log('═══════════════════════════════════════════════════════════');

    const config = this.config.get();
    
    // AI Backend Configuration
    console.log('\n🤖 AI Backend Configuration:');
    console.log(`   Preferred Backend: ${config.ai.preferredBackend}`);
    console.log(`   Fallback Enabled: ${config.ai.enableFallback ? '✅' : '❌'}`);
    console.log(`   Fallback Order: ${config.ai.fallbackOrder.join(' → ')}`);

    // Ollama Configuration
    console.log('\n🦙 Ollama Configuration:');
    console.log(`   Base URL: ${config.ai.ollama.baseUrl}`);
    console.log(`   Default Model: ${config.ai.ollama.defaultModel}`);
    console.log(`   Timeout: ${config.ai.ollama.timeout / 1000}s`);
    console.log(`   Keep Alive: ${config.ai.ollama.keepAlive}`);
    console.log(`   Max Tool Calls: ${config.ai.ollama.maxToolCalls}`);
    console.log(`   Concurrency: ${config.ai.ollama.concurrency}`);
    
    if (verbose) {
      console.log(`   Temperature: ${config.ai.ollama.temperature}`);
      console.log(`   Num Predict: ${config.ai.ollama.numPredict}`);
    }

    // Trust Local Configuration
    console.log('\n🏠 Trust Local Configuration:');
    console.log(`   Enabled: ${config.ai.trustLocal.enabled ? '✅' : '❌'}`);
    console.log(`   GBNF Functions: ${config.ai.trustLocal.gbnfFunctions ? '✅' : '❌'}`);

    // Cloud Configuration
    console.log('\n☁️  Cloud Configuration:');
    console.log(`   Enabled: ${config.ai.cloud.enabled ? '✅' : '❌'}`);
    console.log(`   Provider: ${config.ai.cloud.provider}`);

    // Models Configuration
    console.log('\n📦 Models Configuration:');
    console.log(`   Default Model: ${config.models.default}`);
    console.log(`   Models Directory: ${config.models.directory}`);
    console.log(`   Auto Verify: ${config.models.autoVerify ? '✅' : '❌'}`);

    if (verbose) {
      // Privacy Configuration
      console.log('\n🔒 Privacy Configuration:');
      console.log(`   Privacy Mode: ${config.privacy.privacyMode}`);
      console.log(`   Audit Logging: ${config.privacy.auditLogging ? '✅' : '❌'}`);
      console.log(`   Model Verification: ${config.privacy.modelVerification ? '✅' : '❌'}`);

      // Inference Configuration
      console.log('\n⚡ Inference Configuration:');
      console.log(`   Temperature: ${config.inference.temperature}`);
      console.log(`   Top-P: ${config.inference.topP}`);
      console.log(`   Max Tokens: ${config.inference.maxTokens}`);
      console.log(`   Streaming: ${config.inference.stream ? '✅' : '❌'}`);

      // Transparency Configuration
      console.log('\n👀 Transparency Configuration:');
      console.log(`   Log Prompts: ${config.transparency.logPrompts ? '✅' : '❌'}`);
      console.log(`   Log Responses: ${config.transparency.logResponses ? '✅' : '❌'}`);
      console.log(`   Show Model Info: ${config.transparency.showModelInfo ? '✅' : '❌'}`);
      console.log(`   Show Performance Metrics: ${config.transparency.showPerformanceMetrics ? '✅' : '❌'}`);
    }

    console.log('\n💡 Use "trust config get <key>" for specific values');
    console.log('💡 Use "trust config set <key> <value>" to modify settings');
    console.log('💡 Use "trust config --verbose" for detailed configuration');
  }

  private async getConfig(key: string): Promise<void> {
    const config = this.config.get();
    const value = this.getNestedValue(config, key);
    
    if (value !== undefined) {
      console.log(`${key}: ${typeof value === 'object' ? JSON.stringify(value, null, 2) : value}`);
    } else {
      console.error(`❌ Configuration key '${key}' not found`);
      console.log('\n📝 Available keys:');
      this.showAvailableKeys();
    }
  }

  private async setConfig(key: string, value: string): Promise<void> {
    try {
      const config = this.config.get();
      const parsedValue = this.parseValue(value);
      
      this.setNestedValue(config, key, parsedValue);
      
      // Update the configuration
      (this.config as any).config = config;
      await this.config.save();
      
      console.log(`✅ Configuration updated: ${key} = ${value}`);
      console.log('💡 Restart Trust CLI for changes to take effect');
    } catch (error) {
      console.error(`❌ Failed to set configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async resetConfig(): Promise<void> {
    console.log('⚠️  This will reset all configuration to defaults. Continue? (y/N)');
    
    // In a real CLI, you'd use a prompt library here
    // For now, we'll just show what would be reset
    console.log('\n🔄 Configuration would be reset to defaults:');
    console.log('   - AI backend: ollama');
    console.log('   - Fallback order: ollama → trust-local → cloud');
    console.log('   - Ollama timeout: 60s');
    console.log('   - Privacy mode: strict');
    console.log('   - And all other settings...');
    
    console.log('\n❌ Reset cancelled (interactive prompts not implemented yet)');
    console.log('💡 Manually delete ~/.trustcli/config.json to reset');
  }

  private async setBackend(backend: 'ollama' | 'trust-local' | 'cloud'): Promise<void> {
    this.config.setPreferredBackend(backend as any);
    await this.config.save();
    
    console.log(`✅ Preferred AI backend set to: ${backend}`);
    
    // Show current backend status
    const isEnabled = this.config.isBackendEnabled(backend);
    if (!isEnabled && backend !== 'ollama') {
      console.log(`⚠️  Warning: ${backend} backend is currently disabled`);
      console.log(`💡 Enable it with: trust config set ai.${backend === 'trust-local' ? 'trustLocal' : backend}.enabled true`);
    }
  }

  private async setFallbackOrder(order: string[]): Promise<void> {
    const validBackends = ['ollama', 'trust-local', 'cloud'];
    const invalidBackends = order.filter(b => !validBackends.includes(b));
    
    if (invalidBackends.length > 0) {
      throw new Error(`Invalid backends: ${invalidBackends.join(', ')}. Valid options: ${validBackends.join(', ')}`);
    }
    
    this.config.setFallbackOrder(order as any);
    await this.config.save();
    
    console.log(`✅ Fallback order set to: ${order.join(' → ')}`);
    
    // Show which backends are enabled
    console.log('\n📊 Backend Status:');
    for (const backend of order) {
      const enabled = this.config.isBackendEnabled(backend as any);
      console.log(`   ${backend}: ${enabled ? '✅ Enabled' : '❌ Disabled'}`);
    }
  }

  private async exportConfig(filePath: string): Promise<void> {
    try {
      const config = this.config.get();
      const configJson = JSON.stringify(config, null, 2);
      
      await fs.writeFile(filePath, configJson, 'utf-8');
      console.log(`✅ Configuration exported to: ${filePath}`);
    } catch (error) {
      console.error(`❌ Failed to export configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async importConfig(filePath: string): Promise<void> {
    try {
      const configData = await fs.readFile(filePath, 'utf-8');
      const importedConfig = JSON.parse(configData);
      
      // Validate the imported config has the expected structure
      if (!importedConfig.ai || !importedConfig.models || !importedConfig.privacy) {
        throw new Error('Invalid configuration file format');
      }
      
      (this.config as any).config = importedConfig;
      await this.config.save();
      
      console.log(`✅ Configuration imported from: ${filePath}`);
      console.log('💡 Restart Trust CLI for changes to take effect');
    } catch (error) {
      console.error(`❌ Failed to import configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);
    
    target[lastKey] = value;
  }

  private parseValue(value: string): any {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // If not JSON, try boolean
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
      
      // Try number
      const numValue = Number(value);
      if (!isNaN(numValue)) return numValue;
      
      // Return as string
      return value;
    }
  }

  private showAvailableKeys(): void {
    const keys = [
      'ai.preferredBackend',
      'ai.enableFallback',
      'ai.fallbackOrder',
      'ai.ollama.baseUrl',
      'ai.ollama.defaultModel',
      'ai.ollama.timeout',
      'ai.ollama.keepAlive',
      'ai.ollama.maxToolCalls',
      'ai.ollama.concurrency',
      'ai.ollama.temperature',
      'ai.ollama.numPredict',
      'ai.trustLocal.enabled',
      'ai.trustLocal.gbnfFunctions',
      'ai.cloud.enabled',
      'ai.cloud.provider',
      'models.default',
      'models.directory',
      'models.autoVerify',
      'privacy.privacyMode',
      'privacy.auditLogging',
      'privacy.modelVerification',
      'inference.temperature',
      'inference.topP',
      'inference.maxTokens',
      'inference.stream',
      'transparency.logPrompts',
      'transparency.logResponses',
      'transparency.showModelInfo',
      'transparency.showPerformanceMetrics',
    ];

    keys.forEach(key => console.log(`   ${key}`));
  }
}

export async function handleConfigCommand(args: ConfigCommandArgs): Promise<void> {
  const handler = new ConfigCommandHandler();
  await handler.handleCommand(args);
}