/**
 * @license
 * Copyright 2025 TrustOS Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustOSModelManager, TrustOSConfig } from '@trustos/trust-cli-core';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ModelCommandArgs {
  action: 'list' | 'switch' | 'download' | 'recommend' | 'verify' | 'delete';
  modelName?: string;
  task?: string;
  ramLimit?: number;
  verbose?: boolean;
}

export class ModelCommandHandler {
  private modelManager: TrustOSModelManager;
  private config: TrustOSConfig;

  constructor() {
    this.config = new TrustOSConfig();
    this.modelManager = new TrustOSModelManager();
  }

  async initialize(): Promise<void> {
    await this.config.initialize();
    await this.modelManager.initialize();
  }

  async handleCommand(args: ModelCommandArgs): Promise<void> {
    await this.initialize();

    switch (args.action) {
      case 'list':
        await this.listModels(args.verbose);
        break;
      case 'switch':
        if (!args.modelName) {
          throw new Error('Model name required for switch command');
        }
        await this.switchModel(args.modelName);
        break;
      case 'download':
        if (!args.modelName) {
          throw new Error('Model name required for download command');
        }
        await this.downloadModel(args.modelName);
        break;
      case 'recommend':
        await this.recommendModel(args.task || 'default', args.ramLimit);
        break;
      case 'verify':
        if (!args.modelName) {
          await this.verifyAllModels();
        } else {
          await this.verifyModel(args.modelName);
        }
        break;
      case 'delete':
        if (!args.modelName) {
          throw new Error('Model name required for delete command');
        }
        await this.deleteModel(args.modelName);
        break;
      default:
        throw new Error(`Unknown model command: ${args.action}`);
    }
  }

  private async listModels(verbose = false): Promise<void> {
    const models = this.modelManager.listAvailableModels();
    const currentModel = this.modelManager.getCurrentModel();
    
    console.log('\n🛡️  Trust CLI - Available Models');
    console.log('═'.repeat(60));
    
    if (models.length === 0) {
      console.log('No models found. Use "trust model download <model>" to add models.');
      return;
    }

    for (const model of models) {
      const isCurrent = currentModel?.name === model.name;
      const status = isCurrent ? ' (current)' : '';
      const verified = await this.modelManager.verifyModel(model.path) ? '✓' : '✗';
      
      console.log(`\n${isCurrent ? '→' : ' '} ${model.name}${status}`);
      console.log(`   ${model.description}`);
      console.log(`   Size: ${model.parameters} | RAM: ${model.ramRequirement} | Trust: ${model.trustScore}/10 | Status: ${verified}`);
      
      if (verbose) {
        console.log(`   Type: ${model.type} | Quantization: ${model.quantization}`);
        console.log(`   Context: ${model.contextSize} tokens`);
        console.log(`   Path: ${model.path}`);
        if (model.downloadUrl) {
          console.log(`   Download: ${model.downloadUrl}`);
        }
      }
    }
    
    console.log('\n💡 Use "trust model switch <name>" to change models');
    console.log('💡 Use "trust model recommend <task>" for recommendations');
  }

  private async switchModel(modelName: string): Promise<void> {
    console.log(`\n🔄 Switching to model: ${modelName}`);
    
    try {
      await this.modelManager.switchModel(modelName);
      this.config.setDefaultModel(modelName);
      await this.config.save();
      
      console.log(`✅ Successfully switched to ${modelName}`);
      console.log('💡 The new model will be used for all future conversations');
      
    } catch (error) {
      console.error(`❌ Failed to switch model: ${error}`);
      throw error;
    }
  }

  private async downloadModel(modelName: string): Promise<void> {
    console.log(`\n⬇️  Downloading model: ${modelName}`);
    console.log('This may take several minutes depending on model size and your internet connection...');
    
    try {
      await this.modelManager.downloadModel(modelName);
      console.log(`✅ Successfully downloaded ${modelName}`);
      console.log('💡 Use "trust model switch" to start using this model');
      
    } catch (error) {
      console.error(`❌ Failed to download model: ${error}`);
      throw error;
    }
  }

  private async recommendModel(task: string, ramLimit?: number): Promise<void> {
    console.log(`\n🎯 Model Recommendation for "${task}"`);
    console.log('─'.repeat(40));
    
    // Import performance monitor for hardware analysis
    const { globalPerformanceMonitor } = await import('../../../core/src/trustos/performanceMonitor.js');
    const optimal = globalPerformanceMonitor.getOptimalModelSettings();
    const systemMetrics = globalPerformanceMonitor.getSystemMetrics();
    
    const systemRAM = Math.floor(systemMetrics.memoryUsage.total / (1024 * 1024 * 1024));
    const availableRAM = Math.floor(systemMetrics.memoryUsage.available / (1024 * 1024 * 1024));
    const effectiveRAMLimit = ramLimit || optimal.recommendedRAM;
    
    console.log(`System RAM: ${systemRAM}GB | Available: ${availableRAM}GB | Limit: ${effectiveRAMLimit}GB`);
    
    const recommended = this.modelManager.getRecommendedModel(task, effectiveRAMLimit);
    
    if (recommended) {
      console.log(`\n✅ Recommended: ${recommended.name}`);
      console.log(`📝 ${recommended.description}`);
      console.log(`💾 RAM Required: ${recommended.ramRequirement}`);
      console.log(`⭐ Trust Score: ${recommended.trustScore}/10`);
      
      // Show auto-detected optimization info
      console.log(`\n🔧 Auto-detected settings:`);
      console.log(`   Expected Performance: ${optimal.estimatedSpeed}`);
      console.log(`   Optimal Context Size: ${optimal.maxContextSize} tokens`);
      console.log(`   Recommended Quantization: ${optimal.preferredQuantization}`);
      
      // Performance analysis
      const memoryPercent = (systemMetrics.memoryUsage.used / systemMetrics.memoryUsage.total) * 100;
      if (memoryPercent > 80) {
        console.log(`\n⚠️  Warning: High memory usage (${memoryPercent.toFixed(0)}%)`);
        console.log('   Consider closing other applications before running inference');
      } else if (memoryPercent < 50) {
        console.log(`\n🟢 Good: Low memory usage (${memoryPercent.toFixed(0)}%)`);
        console.log('   System has plenty of resources for larger models');
      }
      
      console.log(`\n💡 Run: trust model switch ${recommended.name}`);
      
      const isDownloaded = await this.modelManager.verifyModel(recommended.path);
      if (!isDownloaded) {
        console.log(`📥 Run: trust model download ${recommended.name}`);
      }
    } else {
      console.log('❌ No suitable model found for your requirements');
      console.log(`\n🔧 Auto-detected optimal settings:`);
      console.log(`   RAM Allocation: ${optimal.recommendedRAM}GB`);
      console.log(`   Context Size: ${optimal.maxContextSize} tokens`);
      console.log(`   Quantization: ${optimal.preferredQuantization}`);
      console.log('💡 Try increasing RAM limit or choosing a different task type');
      console.log('💡 Available task types: coding, quick, complex, default');
    }
  }


  private async deleteModel(modelName: string): Promise<void> {
    console.log(`\n🗑️  Deleting model: ${modelName}`);
    
    // Confirm deletion
    const currentModel = this.modelManager.getCurrentModel();
    if (currentModel?.name === modelName) {
      throw new Error('Cannot delete the currently active model. Switch to a different model first.');
    }
    
    try {
      await this.modelManager.deleteModel(modelName);
      console.log(`✅ Successfully deleted ${modelName}`);
      
    } catch (error) {
      console.error(`❌ Failed to delete model: ${error}`);
      throw error;
    }
  }

  private getSystemRAM(): number {
    const totalMemory = process.memoryUsage().heapTotal;
    // Convert to GB and add some buffer
    return Math.floor(totalMemory / (1024 * 1024 * 1024)) + 8; // Rough estimation
  }
  
  private async verifyModel(modelName: string): Promise<void> {
    console.log(`\n🔍 Verifying model: ${modelName}`);
    
    const models = this.modelManager.listAvailableModels();
    const model = models.find(m => m.name === modelName);
    
    if (!model) {
      console.error(`❌ Model ${modelName} not found`);
      return;
    }
    
    // First check if the file exists
    const exists = await this.modelManager.verifyModel(model.path);
    if (!exists) {
      console.log(`❌ Model ${modelName} is not downloaded`);
      console.log(`💡 Run: trust model download ${modelName}`);
      return;
    }
    
    // Then verify integrity
    const integrity = await this.modelManager.verifyModelIntegrity(modelName);
    
    if (integrity.valid) {
      console.log(`✅ ${integrity.message}`);
      
      // Show model details
      const fs = await import('fs/promises');
      const stats = await fs.stat(model.path);
      console.log(`📊 File size: ${this.formatFileSize(stats.size)}`);
      
      if (model.verificationHash && model.verificationHash !== 'sha256:pending') {
        console.log(`🔐 SHA256: ${model.verificationHash.substring(0, 20)}...`);
      }
    } else {
      console.log(`❌ ${integrity.message}`);
      console.log(`⚠️  Model may be corrupted. Consider re-downloading.`);
    }
  }
  
  private async verifyAllModels(): Promise<void> {
    console.log('\n🔍 Verifying all models...\n');
    
    const models = this.modelManager.listAvailableModels();
    let downloadedCount = 0;
    let verifiedCount = 0;
    
    for (const model of models) {
      const exists = await this.modelManager.verifyModel(model.path);
      
      if (exists) {
        downloadedCount++;
        console.log(`📦 ${model.name}`);
        
        const integrity = await this.modelManager.verifyModelIntegrity(model.name);
        if (integrity.valid) {
          verifiedCount++;
          console.log(`   ✅ ${integrity.message}`);
        } else {
          console.log(`   ❌ ${integrity.message}`);
        }
      } else {
        console.log(`📦 ${model.name}`);
        console.log(`   ⬇️  Not downloaded`);
      }
      console.log('');
    }
    
    console.log('─'.repeat(60));
    console.log(`📊 Summary: ${downloadedCount}/${models.length} models downloaded`);
    console.log(`✅ ${verifiedCount}/${downloadedCount} models verified`);
  }
  
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

export async function handleModelCommand(args: ModelCommandArgs): Promise<void> {
  const handler = new ModelCommandHandler();
  await handler.handleCommand(args);
}