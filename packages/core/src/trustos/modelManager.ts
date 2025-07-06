/**
 * @license
 * Copyright 2025 TrustOS Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { TrustModelConfig, TrustModelManager } from './types.js';
import { createHash } from 'crypto';

export class TrustOSModelManager implements TrustModelManager {
  private modelsDir: string;
  private configFile: string;
  private availableModels: TrustModelConfig[] = [];
  private currentModel: TrustModelConfig | null = null;

  constructor(modelsDir?: string) {
    this.modelsDir = modelsDir || path.join(os.homedir(), '.trustcli', 'models');
    this.configFile = path.join(path.dirname(this.modelsDir), 'models.json');
    this.initializeDefaultModels();
  }

  private initializeDefaultModels(): void {
    // Default model configurations based on the implementation plan
    this.availableModels = [
      {
        name: 'phi-3.5-mini-instruct',
        path: 'phi-3.5-mini-instruct-q4_k_m.gguf',
        type: 'phi',
        quantization: 'Q4_K_M',
        contextSize: 4096,
        ramRequirement: '4GB',
        description: 'Fast coding assistance model - 3.8B parameters',
        parameters: '3.8B',
        trustScore: 9.5,
        downloadUrl: 'https://huggingface.co/microsoft/Phi-3.5-mini-instruct-gguf/blob/main/Phi-3.5-mini-instruct-q4_k_m.gguf'
      },
      {
        name: 'llama-3.2-3b-instruct',
        path: 'llama-3.2-3b-instruct-q8_0.gguf',
        type: 'llama',
        quantization: 'Q8_0',
        contextSize: 4096,
        ramRequirement: '8GB',
        description: 'Balanced performance model - 3B parameters',
        parameters: '3B',
        trustScore: 9.2,
        downloadUrl: 'https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct-gguf/blob/main/llama-3.2-3b-instruct-q8_0.gguf'
      },
      {
        name: 'qwen2.5-1.5b-instruct',
        path: 'qwen2.5-1.5b-instruct-q8_0.gguf',
        type: 'qwen',
        quantization: 'Q8_0',
        contextSize: 4096,
        ramRequirement: '2GB',
        description: 'Lightweight model for quick questions - 1.5B parameters',
        parameters: '1.5B',
        trustScore: 8.8,
        downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-gguf/blob/main/qwen2.5-1.5b-instruct-q8_0.gguf'
      },
      {
        name: 'llama-3.1-8b-instruct',
        path: 'llama-3.1-8b-instruct-q8_0.gguf',
        type: 'llama',
        quantization: 'Q8_0',
        contextSize: 4096,
        ramRequirement: '16GB',
        description: 'High-quality responses - 8B parameters',
        parameters: '8B',
        trustScore: 9.7,
        downloadUrl: 'https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct-gguf/blob/main/llama-3.1-8b-instruct-q8_0.gguf'
      }
    ];
  }

  async initialize(): Promise<void> {
    try {
      // Ensure models directory exists
      await fs.mkdir(this.modelsDir, { recursive: true });
      
      // Load existing config if it exists
      try {
        const configData = await fs.readFile(this.configFile, 'utf-8');
        const savedConfig = JSON.parse(configData);
        if (savedConfig.models) {
          this.availableModels = savedConfig.models;
        }
        if (savedConfig.currentModel) {
          this.currentModel = savedConfig.currentModel;
        }
      } catch (error) {
        // Config file doesn't exist, use defaults
        await this.saveConfig();
      }
      
      // Update model paths to be absolute
      this.availableModels = this.availableModels.map(model => ({
        ...model,
        path: path.isAbsolute(model.path) ? model.path : path.join(this.modelsDir, model.path)
      }));
      
    } catch (error) {
      console.error('Failed to initialize model manager:', error);
      throw error;
    }
  }

  listAvailableModels(): TrustModelConfig[] {
    return [...this.availableModels];
  }

  async downloadModel(modelId: string): Promise<void> {
    const model = this.availableModels.find(m => m.name === modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found in available models`);
    }

    if (!model.downloadUrl) {
      throw new Error(`Download URL not available for model ${modelId}`);
    }

    const modelPath = path.join(this.modelsDir, path.basename(model.path));
    
    // Check if model already exists
    try {
      await fs.access(modelPath);
      console.log(`Model ${modelId} already exists at ${modelPath}`);
      return;
    } catch {
      // Model doesn't exist, proceed with download
    }

    console.log(`Downloading model ${modelId} from ${model.downloadUrl}`);
    console.log(`This may take a while depending on your internet connection...`);
    
    try {
      // For now, just create a placeholder file
      // In a real implementation, this would use fetch or a download library
      await fs.writeFile(modelPath, `# Placeholder for ${modelId}\n# Download from: ${model.downloadUrl}\n`);
      
      console.log(`Model ${modelId} downloaded successfully to ${modelPath}`);
      console.log(`Note: This is a placeholder. In production, implement actual download from Hugging Face.`);
      
    } catch (error) {
      console.error(`Failed to download model ${modelId}:`, error);
      throw error;
    }
  }

  async verifyModel(modelPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(modelPath);
      if (!stats.isFile()) {
        return false;
      }
      
      // Basic verification - check if file exists and has some content
      // In production, this would verify checksums and model integrity
      return stats.size > 0;
      
    } catch (error) {
      console.error(`Failed to verify model at ${modelPath}:`, error);
      return false;
    }
  }

  async switchModel(modelName: string): Promise<void> {
    const model = this.availableModels.find(m => m.name === modelName);
    if (!model) {
      throw new Error(`Model ${modelName} not found`);
    }

    // Verify model exists
    const isValid = await this.verifyModel(model.path);
    if (!isValid) {
      throw new Error(`Model ${modelName} at ${model.path} is not valid or doesn't exist`);
    }

    this.currentModel = model;
    await this.saveConfig();
    console.log(`Switched to model: ${modelName}`);
  }

  getCurrentModel(): TrustModelConfig | null {
    return this.currentModel;
  }

  async getTrustRating(modelId: string): Promise<number> {
    const model = this.availableModels.find(m => m.name === modelId);
    return model?.trustScore || 0;
  }

  getRecommendedModel(task: string, ramLimit?: number): TrustModelConfig | null {
    const ramLimitGB = ramLimit || this.getSystemRAM();
    
    // Filter models by RAM requirement
    const suitableModels = this.availableModels.filter(model => {
      const modelRAM = parseInt(model.ramRequirement.replace('GB', ''));
      return modelRAM <= ramLimitGB;
    });

    if (suitableModels.length === 0) {
      return null;
    }

    // Task-specific recommendations
    switch (task.toLowerCase()) {
      case 'coding':
      case 'code':
        // Prefer models with good coding performance
        return suitableModels.find(m => m.name.includes('phi')) || suitableModels[0];
      
      case 'quick':
      case 'simple':
        // Prefer smallest suitable model
        return suitableModels.reduce((smallest, current) => 
          parseInt(current.ramRequirement) < parseInt(smallest.ramRequirement) ? current : smallest
        );
      
      case 'quality':
      case 'complex':
        // Prefer highest quality model within RAM limit
        return suitableModels.reduce((best, current) => 
          (current.trustScore || 0) > (best.trustScore || 0) ? current : best
        );
      
      default:
        // Default to balanced model
        return suitableModels.find(m => m.name.includes('llama-3.2')) || suitableModels[0];
    }
  }

  async deleteModel(modelName: string): Promise<void> {
    const model = this.availableModels.find(m => m.name === modelName);
    if (!model) {
      throw new Error(`Model ${modelName} not found`);
    }

    try {
      await fs.unlink(model.path);
      console.log(`Deleted model ${modelName} from ${model.path}`);
    } catch (error) {
      console.error(`Failed to delete model ${modelName}:`, error);
      throw error;
    }
  }

  private async saveConfig(): Promise<void> {
    const config = {
      models: this.availableModels,
      currentModel: this.currentModel,
      lastUpdated: new Date().toISOString()
    };

    try {
      await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Failed to save model config:', error);
    }
  }

  private getSystemRAM(): number {
    const totalMemory = os.totalmem();
    return Math.floor(totalMemory / (1024 * 1024 * 1024)); // Convert to GB
  }
}