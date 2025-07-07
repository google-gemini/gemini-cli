/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import { 
  TrustModelClient, 
  TrustModelConfig, 
  GenerationOptions, 
  ModelMetrics 
} from './types.js';
import * as os from 'os';

export class TrustNodeLlamaClient implements TrustModelClient {
  private llama: any = null;
  private model: any = null;
  private context: any = null;
  private currentModelConfig: TrustModelConfig | null = null;
  private reusableSession: LlamaChatSession | null = null;
  private metrics: ModelMetrics = {
    tokensPerSecond: 0,
    memoryUsage: 0,
    responseTime: 0,
    lastUsed: new Date()
  };

  async loadModel(modelPath: string, config?: TrustModelConfig): Promise<void> {
    // Skip if same model is already loaded
    if (this.currentModelConfig?.path === modelPath && this.model) {
      return;
    }

    // Cleanup existing model
    if (this.model) {
      await this.unloadModel();
    }

    try {
      this.llama = await getLlama();
      
      const modelSettings = this.getOptimalSettings(config);
      console.log(`Loading model: ${modelPath}`);
      console.log(`Settings: ${JSON.stringify(modelSettings, null, 2)}`);
      
      this.model = await this.llama.loadModel({
        modelPath,
        ...modelSettings
      });
      
      this.context = await this.model.createContext({
        contextSize: config?.contextSize || 4096
      });
      
      this.currentModelConfig = config || {
        name: 'unknown',
        path: modelPath,
        type: 'llama',
        quantization: 'Q4_K_M',
        contextSize: 4096,
        ramRequirement: '8GB',
        description: 'Unknown model'
      };
      
      console.log(`Model loaded successfully: ${this.currentModelConfig.name}`);
    } catch (error) {
      console.error('Failed to load model:', error);
      throw new Error(`Failed to load model: ${error}`);
    }
  }

  async unloadModel(): Promise<void> {
    try {
      if (this.reusableSession) {
        await this.reusableSession.dispose();
        this.reusableSession = null;
      }
      if (this.context) {
        await this.context.dispose();
        this.context = null;
      }
      if (this.model) {
        await this.model.dispose();
        this.model = null;
      }
      if (this.llama) {
        await this.llama.dispose();
        this.llama = null;
      }
      this.currentModelConfig = null;
      console.log('Model unloaded successfully');
    } catch (error) {
      console.error('Error unloading model:', error);
    }
  }

  async createChatSession(): Promise<LlamaChatSession> {
    if (!this.context) {
      throw new Error('Model not loaded');
    }
    
    // Try reusing existing session first
    if (this.reusableSession) {
      console.log('🔄 Reusing existing chat session...');
      return this.reusableSession;
    }
    
    console.log('🆕 Creating new chat session...');
    this.reusableSession = new LlamaChatSession({
      contextSequence: this.context.getSequence()
    });
    
    return this.reusableSession;
  }

  async generateText(prompt: string, options?: GenerationOptions): Promise<string> {
    if (!this.model) {
      throw new Error('Model not loaded');
    }

    const startTime = Date.now();
    
    try {
      const session = await this.createChatSession();
      const response = await session.prompt(prompt, {
        temperature: options?.temperature ?? 0.7,
        topP: options?.topP ?? 0.9,
        topK: options?.topK ?? 40,
        maxTokens: options?.maxTokens ?? 2048
      });

      const endTime = Date.now();
      this.updateMetrics(endTime - startTime, response.length);
      
      return response;
    } catch (error) {
      console.error('Error generating text:', error);
      throw new Error(`Text generation failed: ${error}`);
    }
  }

  async* generateStream(prompt: string, options?: GenerationOptions): AsyncIterable<string> {
    if (!this.model) {
      throw new Error('Model not loaded');
    }

    const startTime = Date.now();
    let totalTokens = 0;
    
    try {
      const session = await this.createChatSession();
      const response = await session.prompt(prompt, {
        temperature: options?.temperature ?? 0.7,
        topP: options?.topP ?? 0.9,
        topK: options?.topK ?? 40,
        maxTokens: options?.maxTokens ?? 2048
      });

      // For now, yield the complete response as a single chunk
      // TODO: Implement proper streaming with node-llama-cpp
      totalTokens = response.length;
      yield response;

      const endTime = Date.now();
      this.updateMetrics(endTime - startTime, totalTokens);
      
    } catch (error) {
      console.error('Error generating stream:', error);
      throw new Error(`Stream generation failed: ${error}`);
    }
  }

  getModelInfo(): TrustModelConfig | null {
    return this.currentModelConfig;
  }

  getMetrics(): ModelMetrics {
    return { ...this.metrics };
  }

  isModelLoaded(): boolean {
    return this.model !== null;
  }

  private getOptimalSettings(config?: TrustModelConfig) {
    const cpuCount = os.cpus().length;
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    
    // Auto-detect optimal settings based on system capabilities
    const settings = {
      threads: Math.min(8, cpuCount),
      // GPU detection would go here in the future
      // For now, use CPU-only inference
    };
    
    console.log(`System info: ${cpuCount} CPUs, ${(totalMemory / 1024 / 1024 / 1024).toFixed(1)}GB RAM, ${(freeMemory / 1024 / 1024 / 1024).toFixed(1)}GB free`);
    
    return settings;
  }

  private updateMetrics(responseTime: number, tokenCount: number): void {
    this.metrics.responseTime = responseTime;
    this.metrics.tokensPerSecond = tokenCount / (responseTime / 1000);
    this.metrics.memoryUsage = process.memoryUsage().heapUsed;
    this.metrics.lastUsed = new Date();
  }
}