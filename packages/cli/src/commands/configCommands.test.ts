/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConfigCommandHandler, ConfigCommandArgs } from './configCommands.js';
import { TrustConfiguration } from '@trust-cli/trust-cli-core';
import * as fs from 'fs/promises';

// Mock dependencies
vi.mock('@trust-cli/trust-cli-core');
vi.mock('fs/promises');

const MockTrustConfiguration = vi.mocked(TrustConfiguration);
const mockFs = vi.mocked(fs);

describe('ConfigCommandHandler', () => {
  let commandHandler: ConfigCommandHandler;
  let mockConfig: any;
  let mockConsoleLog: any;
  let mockConsoleError: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockConfig = {
      initialize: vi.fn(),
      get: vi.fn().mockReturnValue({
        ai: {
          preferredBackend: 'ollama',
          enableFallback: true,
          fallbackOrder: ['ollama', 'trust-local', 'cloud'],
          ollama: {
            baseUrl: 'http://localhost:11434',
            defaultModel: 'qwen2.5:1.5b',
            timeout: 60000,
            keepAlive: '5m',
            maxToolCalls: 3,
            concurrency: 2,
            temperature: 0.1,
            numPredict: 1000,
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
        models: {
          default: 'phi-3.5-mini-instruct',
          directory: '/home/user/.trustcli/models',
          autoVerify: true,
        },
        privacy: {
          privacyMode: 'strict',
          auditLogging: false,
          modelVerification: true,
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
      }),
      save: vi.fn(),
      setPreferredBackend: vi.fn(),
      setFallbackOrder: vi.fn(),
      isBackendEnabled: vi.fn().mockReturnValue(true),
    };

    MockTrustConfiguration.mockImplementation(() => mockConfig);
    
    // Mock console methods
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    commandHandler = new ConfigCommandHandler();
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('show command', () => {
    it('should display basic configuration', async () => {
      const args: ConfigCommandArgs = { action: 'show' };

      await commandHandler.handleCommand(args);

      expect(mockConfig.initialize).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('\n🛡️  Trust CLI - Configuration');
      expect(mockConsoleLog).toHaveBeenCalledWith('   Preferred Backend: ollama');
      expect(mockConsoleLog).toHaveBeenCalledWith('   Fallback Order: ollama → trust-local → cloud');
    });

    it('should display verbose configuration when requested', async () => {
      const args: ConfigCommandArgs = { action: 'show', verbose: true };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('   Temperature: 0.1');
      expect(mockConsoleLog).toHaveBeenCalledWith('   Num Predict: 1000');
      expect(mockConsoleLog).toHaveBeenCalledWith('\n🔒 Privacy Configuration:');
      expect(mockConsoleLog).toHaveBeenCalledWith('\n⚡ Inference Configuration:');
    });
  });

  describe('get command', () => {
    it('should retrieve specific configuration value', async () => {
      const args: ConfigCommandArgs = { action: 'get', key: 'ai.preferredBackend' };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('ai.preferredBackend: ollama');
    });

    it('should retrieve nested object value', async () => {
      const args: ConfigCommandArgs = { action: 'get', key: 'ai.ollama' };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('ai.ollama: {'));
    });

    it('should show error for non-existent key', async () => {
      const args: ConfigCommandArgs = { action: 'get', key: 'nonexistent.key' };

      await commandHandler.handleCommand(args);

      expect(mockConsoleError).toHaveBeenCalledWith("❌ Configuration key 'nonexistent.key' not found");
      expect(mockConsoleLog).toHaveBeenCalledWith('\n📝 Available keys:');
    });

    it('should throw error when key is missing', async () => {
      const args: ConfigCommandArgs = { action: 'get' };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow(
        'Configuration key required for get command'
      );
    });
  });

  describe('set command', () => {
    it('should set string configuration value', async () => {
      const args: ConfigCommandArgs = { 
        action: 'set', 
        key: 'ai.preferredBackend', 
        value: 'trust-local' 
      };

      await commandHandler.handleCommand(args);

      expect(mockConfig.save).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Configuration updated: ai.preferredBackend = trust-local');
    });

    it('should set boolean configuration value', async () => {
      const args: ConfigCommandArgs = { 
        action: 'set', 
        key: 'ai.enableFallback', 
        value: 'false' 
      };

      await commandHandler.handleCommand(args);

      expect(mockConfig.save).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Configuration updated: ai.enableFallback = false');
    });

    it('should set numeric configuration value', async () => {
      const args: ConfigCommandArgs = { 
        action: 'set', 
        key: 'ai.ollama.timeout', 
        value: '30000' 
      };

      await commandHandler.handleCommand(args);

      expect(mockConfig.save).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Configuration updated: ai.ollama.timeout = 30000');
    });

    it('should throw error when key is missing', async () => {
      const args: ConfigCommandArgs = { action: 'set', value: 'test' };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow(
        'Configuration key and value required for set command'
      );
    });

    it('should throw error when value is missing', async () => {
      const args: ConfigCommandArgs = { action: 'set', key: 'test.key' };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow(
        'Configuration key and value required for set command'
      );
    });
  });

  describe('backend command', () => {
    it('should set preferred backend', async () => {
      const args: ConfigCommandArgs = { action: 'backend', backend: 'trust-local' };

      await commandHandler.handleCommand(args);

      expect(mockConfig.setPreferredBackend).toHaveBeenCalledWith('trust-local');
      expect(mockConfig.save).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Preferred AI backend set to: trust-local');
    });

    it('should warn about disabled backend', async () => {
      mockConfig.isBackendEnabled.mockReturnValue(false);
      const args: ConfigCommandArgs = { action: 'backend', backend: 'cloud' };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('⚠️  Warning: cloud backend is currently disabled');
    });

    it('should throw error when backend is missing', async () => {
      const args: ConfigCommandArgs = { action: 'backend' };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow(
        'Backend name required for backend command'
      );
    });
  });

  describe('fallback command', () => {
    it('should set fallback order', async () => {
      const args: ConfigCommandArgs = { 
        action: 'fallback', 
        order: ['trust-local', 'ollama', 'cloud'] 
      };

      await commandHandler.handleCommand(args);

      expect(mockConfig.setFallbackOrder).toHaveBeenCalledWith(['trust-local', 'ollama', 'cloud']);
      expect(mockConfig.save).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Fallback order set to: trust-local → ollama → cloud');
    });

    it('should show backend status after setting fallback order', async () => {
      const args: ConfigCommandArgs = { 
        action: 'fallback', 
        order: ['ollama', 'trust-local'] 
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('\n📊 Backend Status:');
      expect(mockConsoleLog).toHaveBeenCalledWith('   ollama: ✅ Enabled');
      expect(mockConsoleLog).toHaveBeenCalledWith('   trust-local: ✅ Enabled');
    });

    it('should reject invalid backends', async () => {
      const args: ConfigCommandArgs = { 
        action: 'fallback', 
        order: ['invalid-backend', 'ollama'] 
      };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow(
        'Invalid backends: invalid-backend. Valid options: ollama, trust-local, cloud'
      );
    });

    it('should throw error when order is missing', async () => {
      const args: ConfigCommandArgs = { action: 'fallback' };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow(
        'Fallback order required for fallback command'
      );
    });
  });

  describe('export command', () => {
    it('should export configuration to file', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
      const args: ConfigCommandArgs = { action: 'export', file: '/tmp/config.json' };

      await commandHandler.handleCommand(args);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/tmp/config.json',
        expect.stringContaining('"preferredBackend": "ollama"'),
        'utf-8'
      );
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Configuration exported to: /tmp/config.json');
    });

    it('should handle export errors', async () => {
      mockFs.writeFile.mockRejectedValue(new Error('Permission denied'));
      const args: ConfigCommandArgs = { action: 'export', file: '/invalid/path.json' };

      await commandHandler.handleCommand(args);

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Failed to export configuration: Permission denied');
    });

    it('should throw error when file path is missing', async () => {
      const args: ConfigCommandArgs = { action: 'export' };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow(
        'Export file path required for export command'
      );
    });
  });

  describe('import command', () => {
    it('should import configuration from file', async () => {
      const importConfig = {
        ai: { preferredBackend: 'cloud' },
        models: { default: 'new-model' },
        privacy: { privacyMode: 'relaxed' },
      };
      
      mockFs.readFile.mockResolvedValue(JSON.stringify(importConfig));
      const args: ConfigCommandArgs = { action: 'import', file: '/tmp/config.json' };

      await commandHandler.handleCommand(args);

      expect(mockFs.readFile).toHaveBeenCalledWith('/tmp/config.json', 'utf-8');
      expect(mockConfig.save).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Configuration imported from: /tmp/config.json');
    });

    it('should reject invalid configuration format', async () => {
      mockFs.readFile.mockResolvedValue('{"invalid": "config"}');
      const args: ConfigCommandArgs = { action: 'import', file: '/tmp/invalid.json' };

      await commandHandler.handleCommand(args);

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Failed to import configuration: Invalid configuration file format');
    });

    it('should handle import errors', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      const args: ConfigCommandArgs = { action: 'import', file: '/missing/config.json' };

      await commandHandler.handleCommand(args);

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Failed to import configuration: File not found');
    });

    it('should throw error when file path is missing', async () => {
      const args: ConfigCommandArgs = { action: 'import' };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow(
        'Import file path required for import command'
      );
    });
  });

  describe('reset command', () => {
    it('should show reset information without actually resetting', async () => {
      const args: ConfigCommandArgs = { action: 'reset' };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('⚠️  This will reset all configuration to defaults. Continue? (y/N)');
      expect(mockConsoleLog).toHaveBeenCalledWith('\n❌ Reset cancelled (interactive prompts not implemented yet)');
      expect(mockConfig.save).not.toHaveBeenCalled();
    });
  });

  describe('unknown action', () => {
    it('should throw error for unknown action', async () => {
      const args: ConfigCommandArgs = { action: 'unknown' as any };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow(
        'Unknown config action: unknown'
      );
    });
  });
});