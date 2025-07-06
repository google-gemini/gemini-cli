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
    
    const systemRAM = this.getSystemRAM();
    const effectiveRAMLimit = ramLimit || systemRAM;
    
    console.log(`System RAM: ${systemRAM}GB | Limit: ${effectiveRAMLimit}GB`);
    
    const recommended = this.modelManager.getRecommendedModel(task, effectiveRAMLimit);
    
    if (recommended) {
      console.log(`\n✅ Recommended: ${recommended.name}`);
      console.log(`📝 ${recommended.description}`);
      console.log(`💾 RAM Required: ${recommended.ramRequirement}`);
      console.log(`⭐ Trust Score: ${recommended.trustScore}/10`);
      console.log(`\n💡 Run: trust model switch ${recommended.name}`);
      
      const isDownloaded = await this.modelManager.verifyModel(recommended.path);
      if (!isDownloaded) {
        console.log(`📥 Run: trust model download ${recommended.name}`);
      }
    } else {
      console.log('❌ No suitable model found for your requirements');
      console.log('💡 Try increasing RAM limit or choosing a different task type');
      console.log('💡 Available task types: coding, quick, complex, default');
    }
  }

  private async verifyModel(modelName: string): Promise<void> {
    const models = this.modelManager.listAvailableModels();
    const model = models.find(m => m.name === modelName);
    
    if (!model) {
      throw new Error(`Model ${modelName} not found`);
    }
    
    console.log(`\n🔍 Verifying model: ${modelName}`);
    
    const isValid = await this.modelManager.verifyModel(model.path);
    
    if (isValid) {
      console.log(`✅ Model ${modelName} is valid`);
    } else {
      console.log(`❌ Model ${modelName} verification failed`);
      console.log('💡 Try downloading the model again');
    }
  }

  private async verifyAllModels(): Promise<void> {
    const models = this.modelManager.listAvailableModels();
    
    console.log('\n🔍 Verifying all models...');
    console.log('─'.repeat(30));
    
    for (const model of models) {
      const isValid = await this.modelManager.verifyModel(model.path);
      const status = isValid ? '✅' : '❌';
      console.log(`${status} ${model.name}`);
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
}

export async function handleModelCommand(args: ModelCommandArgs): Promise<void> {
  const handler = new ModelCommandHandler();
  await handler.handleCommand(args);
}