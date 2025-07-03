// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0

import axios, { AxiosInstance } from 'axios';
import { 
  IModelProvider, 
  Model, 
  ChatRequest, 
  ChatResponse, 
  ChatResponseChunk,
  ProviderConfig 
} from './types.js';

/**
 * Provider implementation for GitHub Copilot via VSCode bridge
 */
export class CopilotProvider implements IModelProvider {
  private bridgeUrl: string = 'http://localhost:7337';
  private httpClient: AxiosInstance;
  private initialized: boolean = false;
  private models: Model[] = [];
  private timeout: number = 30000;

  constructor() {
    this.httpClient = axios.create({
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async initialize(config?: ProviderConfig): Promise<void> {
    console.log('🔧 CopilotProvider.initialize() called with config:', config);
    
    if (config?.bridgeUrl) {
      this.bridgeUrl = config.bridgeUrl;
    }
    if (config?.timeout) {
      this.timeout = config.timeout;
      this.httpClient = axios.create({
        baseURL: this.bridgeUrl,
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } else {
      this.httpClient.defaults.baseURL = this.bridgeUrl;
    }

    // Check if bridge is available
    const healthy = await this.healthCheck();
    if (!healthy) {
      throw new Error('VSCode bridge is not available. Please ensure VSCode is running with the Gemini Copilot Bridge extension.');
    }

    // Get available models
    try {
      this.models = await this.listModels();
      if (this.models.length === 0) {
        throw new Error('No Copilot models available. Please ensure GitHub Copilot is installed and authenticated.');
      }
    } catch (error) {
      throw new Error(`Failed to initialize Copilot provider: ${error}`);
    }

    this.initialized = true;
  }

  async listModels(): Promise<Model[]> {
    try {
      const response = await this.httpClient.get('/models');
      return response.data.models || [];
    } catch (error) {
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        throw new Error('Cannot connect to VSCode bridge. Is VSCode running?');
      }
      throw error;
    }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    console.log('🚀 CopilotProvider.chat() called with model:', request.model);
    
    if (!this.initialized) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }

    try {
      console.log('📡 Making POST request to bridge /chat endpoint');
      const response = await this.httpClient.post('/chat', {
        ...request,
        stream: false
      });

      console.log('✅ Got response from bridge:', response.status);
      console.log('📦 Response data:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error('Lost connection to VSCode bridge');
        }
        if (error.response?.status === 400) {
          throw new Error(`Bad request: ${error.response.data.error}`);
        }
        if (error.response?.status === 500) {
          throw new Error(`Bridge error: ${error.response.data.error}`);
        }
      }
      throw error;
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<ChatResponseChunk> {
    console.log('🌊 CopilotProvider.chatStream() called with model:', request.model);
    
    if (!this.initialized) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }

    try {
      console.log('📡 Making streaming request to bridge /chat endpoint');
      
      // Make streaming request using Server-Sent Events
      const response = await this.httpClient.post('/chat', {
        ...request,
        stream: true
      }, {
        responseType: 'stream'
      });

      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              console.log('📨 Received chunk:', parsed);
              yield parsed;
            } catch (e) {
              console.error('Failed to parse SSE data:', data);
            }
          }
        }
      }
    } catch (error) {
      console.error('🔥 Streaming failed:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/health', {
        timeout: 5000
      });
      return response.data.status === 'ok' && response.data.copilot === 'available';
    } catch (error) {
      return false;
    }
  }

  getName(): string {
    return 'GitHub Copilot (via VSCode)';
  }

  async dispose(): Promise<void> {
    this.initialized = false;
    this.models = [];
  }
}