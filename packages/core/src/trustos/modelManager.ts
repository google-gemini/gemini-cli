/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { TrustModelConfig, TrustModelManager } from './types.js';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { ModelDownloader, DownloadProgress } from './modelDownloader.js';

export class TrustModelManagerImpl implements TrustModelManager {
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
        path: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
        type: 'phi',
        quantization: 'Q4_K_M',
        contextSize: 4096,
        ramRequirement: '3GB',
        description: 'Fast coding assistance model - 3.8B parameters',
        parameters: '3.8B',
        trustScore: 9.5,
        downloadUrl: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/blob/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
        verificationHash: 'sha256:pending', // Will be computed after first download
        expectedSize: 2390000000 // ~2.4GB
      },
      {
        name: 'phi-3.5-mini-uncensored',
        path: 'Phi-3.5-mini-instruct_Uncensored-Q4_K_M.gguf',
        type: 'phi',
        quantization: 'Q4_K_M',
        contextSize: 4096,
        ramRequirement: '3GB',
        description: 'Uncensored coding model for risk analysis & auditing - 3.8B parameters',
        parameters: '3.8B',
        trustScore: 9.3,
        downloadUrl: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct_Uncensored-GGUF/blob/main/Phi-3.5-mini-instruct_Uncensored-Q4_K_M.gguf',
        verificationHash: 'sha256:pending',
        expectedSize: 2390000000 // ~2.4GB
      },
      {
        name: 'llama-3.2-3b-instruct',
        path: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
        type: 'llama',
        quantization: 'Q4_K_M',
        contextSize: 4096,
        ramRequirement: '4GB',
        description: 'Balanced performance model - 3B parameters',
        parameters: '3B',
        trustScore: 9.2,
        downloadUrl: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/blob/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
        verificationHash: 'sha256:pending',
        expectedSize: 1900000000 // ~1.9GB
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
        downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-gguf/blob/main/qwen2.5-1.5b-instruct-q8_0.gguf',
        verificationHash: 'sha256:pending',
        expectedSize: 1650000000 // ~1.65GB
      },
      {
        name: 'deepseek-r1-distill-7b',
        path: 'DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
        type: 'deepseek',
        quantization: 'Q4_K_M',
        contextSize: 4096,
        ramRequirement: '6GB',
        description: 'Advanced reasoning model for complex analysis - 7.6B parameters',
        parameters: '7.6B',
        trustScore: 9.6,
        downloadUrl: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF/blob/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
        verificationHash: 'sha256:pending',
        expectedSize: 4450000000 // ~4.5GB
      },
      {
        name: 'llama-3.1-8b-instruct',
        path: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
        type: 'llama',
        quantization: 'Q4_K_M',
        contextSize: 4096,
        ramRequirement: '8GB',
        description: 'High-quality responses - 8B parameters',
        parameters: '8B',
        trustScore: 9.7,
        downloadUrl: 'https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/blob/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
        verificationHash: 'sha256:pending',
        expectedSize: 4920000000 // ~4.9GB
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

    // Load HF token for authentication
    const hfToken = await this.getHuggingFaceToken();
    
    const downloader = new ModelDownloader(this.modelsDir, hfToken);
    
    try {
      console.log(`🚀 Starting download of ${modelId}...`);
      
      const finalPath = await downloader.downloadModel(model, (progress) => {
        const { percentage, speed, eta, downloaded, total } = progress;
        
        // Clear previous line and show progress
        process.stdout.write('\r\x1b[K');
        process.stdout.write(
          `📥 ${percentage.toFixed(1)}% | ` +
          `${ModelDownloader.formatSpeed(speed)} | ` +
          `ETA: ${ModelDownloader.formatETA(eta)} | ` +
          `${this.formatBytes(downloaded)}/${this.formatBytes(total)}`
        );
      });
      
      // Clear progress line
      process.stdout.write('\r\x1b[K');
      console.log(`✅ Model ${modelId} downloaded successfully`);
      console.log(`📁 Location: ${finalPath}`);
      
      // Update model path to point to the downloaded file
      const modelIndex = this.availableModels.findIndex(m => m.name === modelId);
      if (modelIndex !== -1) {
        this.availableModels[modelIndex].path = finalPath;
        await this.saveConfig();
      }
      
    } catch (error) {
      console.error(`\n❌ Failed to download model ${modelId}:`, error);
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
      return stats.size > 0;
      
    } catch (error) {
      // Silently return false for missing files - this is expected for undownloaded models
      return false;
    }
  }
  
  async computeModelHash(modelPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(modelPath);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(`sha256:${hash.digest('hex')}`));
      stream.on('error', reject);
    });
  }
  
  async verifyModelIntegrity(modelName: string): Promise<{ valid: boolean; message: string }> {
    const model = this.availableModels.find(m => m.name === modelName);
    if (!model) {
      return { valid: false, message: `Model ${modelName} not found` };
    }
    
    try {
      const stats = await fs.stat(model.path);
      
      // Check file size if expected size is provided
      if (model.expectedSize) {
        const sizeDiff = Math.abs(stats.size - model.expectedSize);
        const tolerance = model.expectedSize * 0.05; // 5% tolerance
        
        if (sizeDiff > tolerance) {
          return {
            valid: false,
            message: `File size mismatch. Expected: ${this.formatBytes(model.expectedSize)}, Actual: ${this.formatBytes(stats.size)}`
          };
        }
      }
      
      // Compute hash if verification hash is not 'pending'
      if (model.verificationHash && model.verificationHash !== 'sha256:pending') {
        console.log(`Computing SHA256 hash for ${modelName}...`);
        const computedHash = await this.computeModelHash(model.path);
        
        if (computedHash !== model.verificationHash) {
          return {
            valid: false,
            message: `Hash mismatch. Expected: ${model.verificationHash}, Computed: ${computedHash}`
          };
        }
        
        return { valid: true, message: 'Model integrity verified successfully' };
      }
      
      // If no hash is set or it's pending, compute and save it
      if (!model.verificationHash || model.verificationHash === 'sha256:pending') {
        console.log(`Computing and saving hash for ${modelName}...`);
        const computedHash = await this.computeModelHash(model.path);
        
        // Update the model's verification hash
        const modelIndex = this.availableModels.findIndex(m => m.name === modelName);
        if (modelIndex !== -1) {
          this.availableModels[modelIndex].verificationHash = computedHash;
          await this.saveConfig();
        }
        
        return { 
          valid: true, 
          message: `Model hash computed and saved: ${computedHash.substring(0, 16)}...` 
        };
      }
      
      return { valid: true, message: 'Model file exists and size is valid' };
      
    } catch (error) {
      return { 
        valid: false, 
        message: `Error verifying model: ${error instanceof Error ? error.message : String(error)}` 
      };
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
  
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  private async getHuggingFaceToken(): Promise<string | undefined> {
    try {
      const authConfigPath = path.join(os.homedir(), '.trustcli', 'auth.json');
      const content = await fs.readFile(authConfigPath, 'utf-8');
      const config = JSON.parse(content);
      return config.huggingfaceToken;
    } catch {
      return undefined;
    }
  }
}