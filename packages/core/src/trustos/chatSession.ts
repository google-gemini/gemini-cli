/**
 * @license
 * Copyright 2025 Trust Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustNodeLlamaClient } from './nodeLlamaClient.js';
import { TrustModelConfig, GenerationOptions } from './types.js';
import { globalPerformanceMonitor } from './performanceMonitor.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Chat message interface
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  modelUsed?: string;
  tokensUsed?: number;
  responseTime?: number;
}

/**
 * Chat session configuration
 */
export interface ChatSessionConfig {
  sessionId?: string;
  systemPrompt?: string;
  maxHistory?: number;
  persistHistory?: boolean;
  modelConfig?: TrustModelConfig;
  generationOptions?: GenerationOptions;
}

/**
 * Enhanced chat session with streaming and history management
 * Part of Trust: An Open System for Modern Assurance
 */
export class TrustChatSession {
  private client: TrustNodeLlamaClient;
  private config: ChatSessionConfig;
  private messages: ChatMessage[] = [];
  private sessionId: string;
  private historyPath?: string;

  constructor(client: TrustNodeLlamaClient, config: ChatSessionConfig = {}) {
    this.client = client;
    this.config = {
      maxHistory: 50,
      persistHistory: true,
      ...config,
    };
    this.sessionId = config.sessionId || this.generateSessionId();
    
    if (this.config.persistHistory) {
      this.historyPath = path.join(os.homedir(), '.trustcli', 'history', `${this.sessionId}.json`);
    }
  }

  /**
   * Initialize the chat session
   */
  async initialize(): Promise<void> {
    // Load existing history if available
    if (this.historyPath) {
      try {
        await fs.mkdir(path.dirname(this.historyPath), { recursive: true });
        const historyData = await fs.readFile(this.historyPath, 'utf-8');
        const history = JSON.parse(historyData);
        this.messages = history.messages || [];
      } catch (error) {
        // History file doesn't exist yet, start fresh
        this.messages = [];
      }
    }

    // Add system prompt if provided
    if (this.config.systemPrompt) {
      this.addMessage('system', this.config.systemPrompt);
    }
  }

  /**
   * Send a message and get streaming response
   */
  async *sendMessage(
    content: string, 
    options?: GenerationOptions
  ): AsyncGenerator<{ chunk: string; messageId: string; isComplete: boolean }> {
    const messageId = this.generateMessageId();
    const startTime = Date.now();
    
    // Add user message to history
    this.addMessage('user', content);
    
    // Prepare the conversation context
    const conversationContext = this.buildConversationContext();
    const finalOptions = { ...this.config.generationOptions, ...options };
    
    let fullResponse = '';
    let tokenCount = 0;
    
    try {
      // Generate streaming response
      for await (const chunk of this.client.generateStream(conversationContext, finalOptions)) {
        fullResponse += chunk;
        tokenCount++;
        
        yield {
          chunk,
          messageId,
          isComplete: false,
        };
      }
      
      const responseTime = Date.now() - startTime;
      
      // Add assistant response to history
      const assistantMessage = this.addMessage('assistant', fullResponse, {
        modelUsed: this.client.getModelInfo()?.name,
        tokensUsed: tokenCount,
        responseTime,
      });
      
      // Record performance metrics
      globalPerformanceMonitor.recordInference({
        tokensPerSecond: tokenCount / (responseTime / 1000),
        totalTokens: tokenCount,
        inferenceTime: responseTime,
        modelName: this.client.getModelInfo()?.name || 'unknown',
        promptLength: content.length,
        responseLength: fullResponse.length,
        timestamp: new Date(),
      });
      
      // Save history
      await this.saveHistory();
      
      yield {
        chunk: '',
        messageId: assistantMessage.id,
        isComplete: true,
      };
      
    } catch (error) {
      console.error('Error in chat session:', error);
      
      // Add error message to history
      const errorMessage = this.addMessage('assistant', `Error: ${error}`, {
        modelUsed: this.client.getModelInfo()?.name,
        responseTime: Date.now() - startTime,
      });
      
      yield {
        chunk: `Error: ${error}`,
        messageId: errorMessage.id,
        isComplete: true,
      };
    }
  }

  /**
   * Send a message and get complete response (non-streaming)
   */
  async sendMessageSync(content: string, options?: GenerationOptions): Promise<ChatMessage> {
    let fullResponse = '';
    let messageId = '';
    
    for await (const { chunk, messageId: id, isComplete } of this.sendMessage(content, options)) {
      fullResponse += chunk;
      messageId = id;
      
      if (isComplete) {
        break;
      }
    }
    
    return this.getMessageById(messageId)!;
  }

  /**
   * Get chat history
   */
  getHistory(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Clear chat history
   */
  async clearHistory(): Promise<void> {
    this.messages = [];
    
    // Re-add system prompt if configured
    if (this.config.systemPrompt) {
      this.addMessage('system', this.config.systemPrompt);
    }
    
    await this.saveHistory();
  }

  /**
   * Get conversation statistics
   */
  getStats(): {
    totalMessages: number;
    userMessages: number;
    assistantMessages: number;
    averageResponseTime: number;
    totalTokensUsed: number;
  } {
    const userMessages = this.messages.filter(m => m.role === 'user').length;
    const assistantMessages = this.messages.filter(m => m.role === 'assistant');
    const totalTokens = assistantMessages.reduce((sum, m) => sum + (m.tokensUsed || 0), 0);
    const avgResponseTime = assistantMessages.reduce((sum, m) => sum + (m.responseTime || 0), 0) / assistantMessages.length;
    
    return {
      totalMessages: this.messages.length,
      userMessages,
      assistantMessages: assistantMessages.length,
      averageResponseTime: avgResponseTime || 0,
      totalTokensUsed: totalTokens,
    };
  }

  /**
   * Export conversation as markdown
   */
  exportAsMarkdown(): string {
    let markdown = `# Trust CLI Conversation\\n`;
    markdown += `**Session ID:** ${this.sessionId}\\n`;
    markdown += `**Date:** ${new Date().toISOString()}\\n\\n`;
    
    for (const message of this.messages) {
      if (message.role === 'system') continue;
      
      const role = message.role === 'user' ? '**User**' : '**Assistant**';
      const timestamp = message.timestamp.toLocaleString();
      
      markdown += `## ${role} (${timestamp})\\n\\n`;
      markdown += `${message.content}\\n\\n`;
      
      if (message.role === 'assistant' && message.modelUsed) {
        markdown += `*Model: ${message.modelUsed}*`;
        if (message.tokensUsed) {
          markdown += ` | *Tokens: ${message.tokensUsed}*`;
        }
        if (message.responseTime) {
          markdown += ` | *Time: ${message.responseTime}ms*`;
        }
        markdown += '\\n\\n';
      }
    }
    
    return markdown;
  }

  private addMessage(
    role: 'user' | 'assistant' | 'system', 
    content: string, 
    metadata?: Partial<ChatMessage>
  ): ChatMessage {
    const message: ChatMessage = {
      id: this.generateMessageId(),
      role,
      content,
      timestamp: new Date(),
      ...metadata,
    };
    
    this.messages.push(message);
    
    // Trim history if needed
    if (this.config.maxHistory && this.messages.length > this.config.maxHistory) {
      const systemMessages = this.messages.filter(m => m.role === 'system');
      const otherMessages = this.messages.filter(m => m.role !== 'system');
      
      // Keep system messages and trim others
      const trimmed = otherMessages.slice(-this.config.maxHistory + systemMessages.length);
      this.messages = [...systemMessages, ...trimmed];
    }
    
    return message;
  }

  private buildConversationContext(): string {
    let context = '';
    
    for (const message of this.messages) {
      if (message.role === 'system') {
        context += `System: ${message.content}\\n\\n`;
      } else if (message.role === 'user') {
        context += `User: ${message.content}\\n\\n`;
      } else if (message.role === 'assistant') {
        context += `Assistant: ${message.content}\\n\\n`;
      }
    }
    
    return context.trim();
  }

  private async saveHistory(): Promise<void> {
    if (!this.historyPath || !this.config.persistHistory) {
      return;
    }
    
    try {
      const historyData = {
        sessionId: this.sessionId,
        createdAt: new Date().toISOString(),
        messages: this.messages,
      };
      
      await fs.writeFile(this.historyPath, JSON.stringify(historyData, null, 2));
    } catch (error) {
      console.warn('Failed to save chat history:', error);
    }
  }

  private getMessageById(id: string): ChatMessage | undefined {
    return this.messages.find(m => m.id === id);
  }

  private generateSessionId(): string {
    return `trust-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}