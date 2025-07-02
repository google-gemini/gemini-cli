// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0

import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
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
    if (!this.initialized) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }

    try {
      const response = await this.httpClient.post('/chat', {
        ...request,
        stream: false
      });

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
    if (!this.initialized) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }

    // Use WebSocket for streaming
    const wsUrl = this.bridgeUrl.replace(/^http/, 'ws') + '/stream';
    const ws = new WebSocket(wsUrl);

    try {
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve());
        ws.on('error', reject);
        
        // Timeout connection
        setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
      });

      // Send the chat request
      ws.send(JSON.stringify({
        type: 'chat',
        data: {
          ...request,
          stream: true
        }
      }));

      // Receive streaming responses
      const messageQueue: any[] = [];
      let done = false;
      let error: Error | null = null;

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          switch (message.type) {
            case 'chat_chunk':
              messageQueue.push(message.data);
              break;
            case 'chat_done':
              done = true;
              break;
            case 'error':
              error = new Error(message.error);
              done = true;
              break;
          }
        } catch (err) {
          error = new Error(`Failed to parse WebSocket message: ${err}`);
          done = true;
        }
      });

      ws.on('error', (err) => {
        error = err;
        done = true;
      });

      ws.on('close', () => {
        done = true;
      });

      // Yield messages as they arrive
      while (!done || messageQueue.length > 0) {
        if (error) {
          throw error;
        }

        if (messageQueue.length > 0) {
          const chunk = messageQueue.shift();
          yield chunk;
        } else {
          // Wait for more messages
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      if (error) {
        throw error;
      }
    } finally {
      ws.close();
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