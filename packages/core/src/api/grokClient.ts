const GROK_API_BASE_URL = 'https://api.x.ai';

export interface GrokMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string; // For tool messages
  tool_call_id?: string; // For tool response messages
  tool_calls?: GrokToolCall[]; // For assistant messages with tool calls
}

export interface GrokToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface GrokTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>; // JSON Schema
  };
}

export interface GrokChatCompletionRequest {
  model: string;
  messages: GrokMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  reasoning_effort?: 'low' | 'medium' | 'high';
  tools?: GrokTool[];
  tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
}

export interface GrokChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      reasoning_content?: string;
      refusal?: string | null;
      tool_calls?: GrokToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface GrokStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
}

export interface GrokClientConfig {
  grokApiKey?: string;
}

export class GrokClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: GrokClientConfig) {
    const apiKey = config.grokApiKey || process.env.GROK_API_KEY;
    if (!apiKey) {
      throw new Error('Grok API key is required. Set GROK_API_KEY environment variable or use --grok-api-key flag.');
    }
    this.apiKey = apiKey;
    this.baseUrl = GROK_API_BASE_URL;
  }

  async createChatCompletion(request: GrokChatCompletionRequest): Promise<GrokChatCompletionResponse> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    
    // Debug logging could be added here if needed

    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      // Error logging could be added here
      throw new Error(`Grok API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

      const data = await response.json();
      return data as GrokChatCompletionResponse;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Grok API request timed out after 2 minutes');
      }
      throw error;
    }
  }

  async *createChatCompletionStream(request: GrokChatCompletionRequest): AsyncGenerator<GrokStreamChunk> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    
    const streamRequest = { ...request, stream: true };
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(streamRequest),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        // Error logging could be added here
        throw new Error(`Grok API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                return;
              }
              try {
                const chunk = JSON.parse(data) as GrokStreamChunk;
                yield chunk;
              } catch (error) {
                // Failed to parse SSE chunk
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Grok API stream timed out after 2 minutes');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.createChatCompletion({
        model: 'grok-4-0709',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
        temperature: 0,
      });
      return !!response.id;
    } catch (error) {
      // Connection test failed
      return false;
    }
  }
}