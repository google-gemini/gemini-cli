/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { ModelCommandHandler } from './modelCommands.js';
import type { ModelCommandArgs } from './modelCommands.js';

// Mock the core dependencies
vi.mock('../../../core/dist/index.js', () => ({
  TrustConfiguration: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    getModelsDirectory: vi.fn().mockReturnValue('/test/models'),
    setDefaultModel: vi.fn(),
    save: vi.fn()
  })),
  TrustModelManagerImpl: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    listAvailableModels: vi.fn().mockReturnValue([
      {
        name: 'qwen2.5-1.5b-instruct',
        path: '/models/qwen2.5-1.5b-instruct.gguf',
        type: 'gguf',
        parameters: '1.5B',
        contextSize: 4096,
        quantization: 'Q4_K_M',
        trustScore: 9,
        ramRequirement: '2GB',
        description: 'Lightweight model for quick questions - 1.5B parameters',
        verificationHash: 'sha256:d7efb072e...',
        downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-gguf'
      },
      {
        name: 'codellama-7b-instruct',
        path: '/models/codellama-7b-instruct.gguf',
        type: 'gguf',
        parameters: '7B',
        contextSize: 8192,
        quantization: 'Q4_K_M',
        trustScore: 8,
        ramRequirement: '4GB',
        description: 'Code-focused model - 7B parameters',
        verificationHash: 'sha256:pending'
      }
    ]),
    getCurrentModel: vi.fn().mockReturnValue({
      name: 'qwen2.5-1.5b-instruct',
      path: '/models/qwen2.5-1.5b-instruct.gguf',
      type: 'gguf',
      parameters: '1.5B',
      contextSize: 4096,
      quantization: 'Q4_K_M',
      trustScore: 9,
      ramRequirement: '2GB',
      description: 'Lightweight model for quick questions - 1.5B parameters'
    }),
    switchModel: vi.fn(),
    downloadModel: vi.fn(),
    getRecommendedModel: vi.fn().mockReturnValue({
      name: 'qwen2.5-1.5b-instruct',
      path: '/models/qwen2.5-1.5b-instruct.gguf',
      type: 'gguf',
      parameters: '1.5B',
      contextSize: 4096,
      quantization: 'Q4_K_M',
      trustScore: 9,
      ramRequirement: '2GB',
      description: 'Lightweight model for quick questions - 1.5B parameters'
    }),
    verifyModel: vi.fn().mockReturnValue(true),
    verifyModelIntegrity: vi.fn().mockResolvedValue({ valid: true, message: 'Model integrity verified successfully' }),
    verifyAllModels: vi.fn().mockResolvedValue(new Map([
      ['qwen2.5-1.5b-instruct', { valid: true, message: 'Model integrity verified successfully' }],
      ['codellama-7b-instruct', { valid: false, message: 'Model not downloaded' }]
    ])),
    deleteModel: vi.fn(),
    generateModelReport: vi.fn().mockResolvedValue('/models/qwen2.5-1.5b-instruct.gguf.manifest.json')
  })),
  globalPerformanceMonitor: {
    getSystemMetrics: vi.fn().mockReturnValue({
      memoryUsage: {
        total: 16,
        available: 8,
        used: 8,
        usagePercentage: 50
      },
      cpuInfo: {
        cores: 8,
        model: 'Intel i7',
        loadAverage: [1.2, 1.5, 1.8]
      },
      platform: {
        os: 'linux',
        arch: 'x64',
        nodeVersion: '20.0.0'
      }
    }),
    getOptimalModelSettings: vi.fn().mockReturnValue({
      recommendedRAM: 4,
      maxContextSize: 8192,
      estimatedSpeed: 'fast'
    })
  }
}));

// Mock console methods
const mockConsoleLog = vi.fn();
const mockConsoleError = vi.fn();
const mockConsoleTable = vi.fn();

global.console = {
  ...console,
  log: mockConsoleLog,
  error: mockConsoleError,
  table: mockConsoleTable
};

describe('ModelCommandHandler', () => {
  let commandHandler: ModelCommandHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    commandHandler = new ModelCommandHandler();
  });

  describe('list command', () => {
    it('should list available models', async () => {
      const args: ModelCommandArgs = {
        action: 'list',
        model: undefined,
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('📋 Available Models:');
      expect(mockConsoleTable).toHaveBeenCalled();
    });

    it('should show current model indicator', async () => {
      const args: ModelCommandArgs = {
        action: 'list',
        model: undefined,
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      // Should show which model is currently active
      expect(mockConsoleLog).toHaveBeenCalledWith('\n🎯 Current model: qwen2.5-1.5b-instruct');
    });
  });

  describe('switch command', () => {
    it('should switch to specified model', async () => {
      const args: ModelCommandArgs = {
        action: 'switch',
        model: 'codellama-7b-instruct',
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('🔄 Switching to model: codellama-7b-instruct');
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Successfully switched to codellama-7b-instruct');
    });

    it('should handle missing model name', async () => {
      const args: ModelCommandArgs = {
        action: 'switch',
        model: undefined,
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Please specify a model name');
      expect(mockConsoleLog).toHaveBeenCalledWith('Usage: trust model switch <model-name>');
    });

    it('should handle switch errors', async () => {
      const mockModelManager = (await import('../../../core/dist/index.js')).TrustModelManagerImpl;
      const mockInstance = new mockModelManager();
      (mockInstance.switchModel as MockedFunction<any>).mockRejectedValue(new Error('Model not found'));

      const args: ModelCommandArgs = {
        action: 'switch',
        model: 'non-existent-model',
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('❌ Failed to switch model'));
    });
  });

  describe('download command', () => {
    it('should download specified model', async () => {
      const args: ModelCommandArgs = {
        action: 'download',
        model: 'new-model',
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('📥 Downloading model: new-model');
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Successfully downloaded new-model');
    });

    it('should handle missing model name for download', async () => {
      const args: ModelCommandArgs = {
        action: 'download',
        model: undefined,
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Please specify a model name to download');
      expect(mockConsoleLog).toHaveBeenCalledWith('Usage: trust model download <model-name>');
    });

    it('should handle download errors', async () => {
      const mockModelManager = (await import('../../../core/dist/index.js')).TrustModelManagerImpl;
      const mockInstance = new mockModelManager();
      (mockInstance.downloadModel as MockedFunction<any>).mockRejectedValue(new Error('Download failed'));

      const args: ModelCommandArgs = {
        action: 'download',
        model: 'failing-model',
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('❌ Failed to download model'));
    });
  });

  describe('recommend command', () => {
    it('should recommend model for specified task', async () => {
      const args: ModelCommandArgs = {
        action: 'recommend',
        model: undefined,
        task: 'coding',
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('🎯 Model recommendation for: coding');
      expect(mockConsoleLog).toHaveBeenCalledWith('📊 Recommended: qwen2.5-1.5b-instruct');
    });

    it('should recommend model with RAM limit', async () => {
      const args: ModelCommandArgs = {
        action: 'recommend',
        model: undefined,
        task: 'coding',
        ram: 2
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('🎯 Model recommendation for: coding (max 2GB RAM)');
    });

    it('should handle no recommendations available', async () => {
      const mockModelManager = (await import('../../../core/dist/index.js')).TrustModelManagerImpl;
      const mockInstance = new mockModelManager();
      (mockInstance.getRecommendedModel as MockedFunction<any>).mockReturnValue(null);

      const args: ModelCommandArgs = {
        action: 'recommend',
        model: undefined,
        task: 'unknown-task',
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('❌ No suitable model found for the specified requirements');
    });

    it('should use default task if not specified', async () => {
      const args: ModelCommandArgs = {
        action: 'recommend',
        model: undefined,
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('🎯 Model recommendation for: general');
    });
  });

  describe('verify command', () => {
    it('should verify specified model', async () => {
      const args: ModelCommandArgs = {
        action: 'verify',
        model: 'qwen2.5-1.5b-instruct',
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('🔍 Verifying model: qwen2.5-1.5b-instruct');
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Model verification: Model is valid');
    });

    it('should handle missing model name for verify', async () => {
      const args: ModelCommandArgs = {
        action: 'verify',
        model: undefined,
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Please specify a model name to verify');
    });

    it('should handle verification failure', async () => {
      const mockModelManager = (await import('../../../core/dist/index.js')).TrustModelManagerImpl;
      const mockInstance = new mockModelManager();
      (mockInstance.verifyModelIntegrity as MockedFunction<any>).mockResolvedValue({
        valid: false,
        message: 'Checksum mismatch'
      });

      const args: ModelCommandArgs = {
        action: 'verify',
        model: 'corrupted-model',
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('❌ Model verification: Checksum mismatch');
    });
  });

  describe('delete command', () => {
    it('should delete specified model', async () => {
      const args: ModelCommandArgs = {
        action: 'delete',
        model: 'old-model',
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('🗑️  Deleting model: old-model');
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Successfully deleted old-model');
    });

    it('should handle missing model name for delete', async () => {
      const args: ModelCommandArgs = {
        action: 'delete',
        model: undefined,
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Please specify a model name to delete');
    });

    it('should handle delete errors', async () => {
      const mockModelManager = (await import('../../../core/dist/index.js')).TrustModelManagerImpl;
      const mockInstance = new mockModelManager();
      (mockInstance.deleteModel as MockedFunction<any>).mockRejectedValue(new Error('Cannot delete active model'));

      const args: ModelCommandArgs = {
        action: 'delete',
        model: 'active-model',
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('❌ Failed to delete model'));
    });
  });

  describe('system info integration', () => {
    it('should show system information with recommendations', async () => {
      const args: ModelCommandArgs = {
        action: 'recommend',
        model: undefined,
        task: 'coding',
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      // Should display system metrics
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('💾 Available RAM: 8GB'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🖥️  CPU Cores: 8'));
    });

    it('should provide performance context in recommendations', async () => {
      const args: ModelCommandArgs = {
        action: 'recommend',
        model: undefined,
        task: 'coding',
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚡ Expected Performance: fast'));
    });
  });

  describe('error handling', () => {
    it('should handle invalid action', async () => {
      const args: ModelCommandArgs = {
        action: 'invalid' as any,
        model: undefined,
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Unknown model command: invalid');
    });

    it('should handle initialization errors', async () => {
      const mockModelManager = (await import('../../../core/dist/index.js')).TrustModelManagerImpl;
      const mockInstance = new mockModelManager();
      (mockInstance.initialize as MockedFunction<any>).mockRejectedValue(new Error('Init failed'));

      const args: ModelCommandArgs = {
        action: 'list',
        model: undefined,
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('❌ Failed to execute model command'));
    });
  });

  describe('command validation', () => {
    it('should validate model names', async () => {
      const args: ModelCommandArgs = {
        action: 'switch',
        model: '',
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Please specify a model name');
    });

    it('should validate RAM limits', async () => {
      const args: ModelCommandArgs = {
        action: 'recommend',
        model: undefined,
        task: 'coding',
        ram: -1
      };

      await commandHandler.handleCommand(args);

      // Should handle invalid RAM values gracefully
      expect(mockConsoleLog).toHaveBeenCalledWith('🎯 Model recommendation for: coding');
    });
  });

  describe('help and usage', () => {
    it('should provide usage information for invalid commands', async () => {
      const args: ModelCommandArgs = {
        action: 'switch',
        model: undefined,
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('Usage: trust model switch <model-name>');
    });

    it('should provide examples in error messages', async () => {
      const args: ModelCommandArgs = {
        action: 'download',
        model: undefined,
        task: undefined,
        ram: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('Example: trust model download qwen2.5-1.5b-instruct');
    });
  });

  describe('report command', () => {
    it('should generate integrity report for specified model', async () => {
      const args: ModelCommandArgs = {
        action: 'report',
        modelName: 'qwen2.5-1.5b-instruct',
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('📄 Generating integrity report for: qwen2.5-1.5b-instruct');
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Integrity report generated successfully');
    });

    it('should handle missing model name for report', async () => {
      const args: ModelCommandArgs = {
        action: 'report',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow('Model name required for report command');
    });

    it('should handle report generation failure', async () => {
      const mockModelManager = (await import('../../../core/dist/index.js')).TrustModelManagerImpl;
      const mockInstance = new mockModelManager();
      (mockInstance.generateModelReport as MockedFunction<any>).mockResolvedValue(null);

      const args: ModelCommandArgs = {
        action: 'report',
        modelName: 'non-existent-model',
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Failed to generate report'));
    });
  });

  describe('trust command', () => {
    it('should show trusted models registry', async () => {
      const args: ModelCommandArgs = {
        action: 'trust',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('🛡️  Trust CLI - Trusted Model Registry');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Model Trust Status:'));
    });

    it('should handle export functionality', async () => {
      const args: ModelCommandArgs = {
        action: 'trust',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined,
        export: true
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('📤 Exporting trusted model database...');
    });

    it('should display trusted models with hashes', async () => {
      const args: ModelCommandArgs = {
        action: 'trust',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✅ qwen2.5-1.5b-instruct'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Hash: sha256:d7efb072e...'));
    });
  });

  describe('verify command enhancements', () => {
    it('should verify all models when no model name provided', async () => {
      const args: ModelCommandArgs = {
        action: 'verify',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('🔍 Verifying all models...');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Summary:'));
    });

    it('should show detailed verification results', async () => {
      const args: ModelCommandArgs = {
        action: 'verify',
        modelName: 'qwen2.5-1.5b-instruct',
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('🔍 Verifying model: qwen2.5-1.5b-instruct');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('File integrity verified'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Size validation passed'));
    });

    it('should provide security status information', async () => {
      const args: ModelCommandArgs = {
        action: 'verify',
        modelName: 'qwen2.5-1.5b-instruct',
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🛡️  Security Status:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Cryptographic hash verified'));
    });

    it('should show remediation steps for failed verification', async () => {
      const mockModelManager = (await import('../../../core/dist/index.js')).TrustModelManagerImpl;
      const mockInstance = new mockModelManager();
      (mockInstance.verifyModelIntegrity as MockedFunction<any>).mockResolvedValue({
        valid: false,
        message: 'Hash mismatch detected'
      });

      const args: ModelCommandArgs = {
        action: 'verify',
        modelName: 'corrupted-model',
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚠️  Model verification failed!'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔧 Recommended actions:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('1. Delete the corrupted file'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('2. Re-download the model'));
    });
  });

  describe('security and integrity features', () => {
    it('should display model integrity information', async () => {
      const args: ModelCommandArgs = {
        action: 'list',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined,
        verbose: true
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Trust: 9/10'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Status: ✓'));
    });

    it('should show download URLs in verbose mode', async () => {
      const args: ModelCommandArgs = {
        action: 'list',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined,
        verbose: true
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Download: https://huggingface.co'));
    });

    it('should handle models without verification hash', async () => {
      const args: ModelCommandArgs = {
        action: 'trust',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚠️  codellama-7b-instruct'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Status: Verified but no stored hash'));
    });

    it('should provide security tips', async () => {
      const args: ModelCommandArgs = {
        action: 'trust',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('💡 Tips:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Run \'trust model verify\' to check all models'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Run \'trust model report <name>\' for detailed integrity report'));
    });
  });
});