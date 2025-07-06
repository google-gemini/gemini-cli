/**
 * @license
 * Copyright 2025 Trust Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { TrustModelConfig } from './types.js';

/**
 * Context chunk for managing large codebases
 */
export interface ContextChunk {
  id: string;
  content: string;
  source: string;
  importance: number;
  tokenCount: number;
  timestamp: Date;
}

/**
 * Context summary for efficient memory usage
 */
export interface ContextSummary {
  id: string;
  originalChunks: string[];
  summary: string;
  tokenCount: number;
  createdAt: Date;
}

/**
 * Long context manager for codebase analysis
 * Trust: An Open System for Modern Assurance
 */
export class TrustContextManager {
  private chunks: Map<string, ContextChunk> = new Map();
  private summaries: Map<string, ContextSummary> = new Map();
  private maxContextSize: number;
  private compressionRatio = 0.3; // Target 30% of original size for summaries

  constructor(modelConfig?: TrustModelConfig) {
    // Set context size based on model configuration
    this.maxContextSize = modelConfig?.contextSize || 4096;
  }

  /**
   * Add content to context management
   */
  addContent(source: string, content: string, importance = 1.0): ContextChunk {
    const chunk: ContextChunk = {
      id: this.generateChunkId(),
      content,
      source,
      importance,
      tokenCount: this.estimateTokens(content),
      timestamp: new Date(),
    };

    this.chunks.set(chunk.id, chunk);
    return chunk;
  }

  /**
   * Add file content to context
   */
  async addFile(filePath: string, importance = 1.0): Promise<ContextChunk> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(process.cwd(), filePath);
      return this.addContent(relativePath, content, importance);
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error}`);
    }
  }

  /**
   * Add directory contents recursively
   */
  async addDirectory(
    dirPath: string, 
    options: {
      extensions?: string[];
      exclude?: string[];
      maxFiles?: number;
      importance?: number;
    } = {}
  ): Promise<ContextChunk[]> {
    const {
      extensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.cpp', '.c', '.h'],
      exclude = ['node_modules', '.git', 'dist', 'build', '.next'],
      maxFiles = 100,
      importance = 1.0,
    } = options;

    const chunks: ContextChunk[] = [];
    
    try {
      const files = await this.findFiles(dirPath, extensions, exclude, maxFiles);
      
      for (const file of files) {
        try {
          const chunk = await this.addFile(file, importance);
          chunks.push(chunk);
        } catch (error) {
          console.warn(`Failed to add file ${file}:`, error);
        }
      }
      
    } catch (error) {
      throw new Error(`Failed to read directory ${dirPath}: ${error}`);
    }

    return chunks;
  }

  /**
   * Get optimized context for current query
   */
  getOptimizedContext(query: string, targetTokens?: number): string {
    const target = targetTokens || Math.floor(this.maxContextSize * 0.8); // Reserve 20% for response
    
    // Score chunks based on relevance to query
    const scoredChunks = Array.from(this.chunks.values())
      .map(chunk => ({
        chunk,
        score: this.calculateRelevanceScore(chunk, query),
      }))
      .sort((a, b) => b.score - a.score);

    let context = '';
    let tokenCount = 0;
    const includedChunks: ContextChunk[] = [];

    // Include highest-scoring chunks that fit in context
    for (const { chunk } of scoredChunks) {
      if (tokenCount + chunk.tokenCount <= target) {
        includedChunks.push(chunk);
        tokenCount += chunk.tokenCount;
      } else if (context === '') {
        // If even the first chunk is too large, summarize it
        const summary = this.createChunkSummary(chunk, target);
        context = this.formatChunkForContext(chunk.source, summary.summary);
        tokenCount = summary.tokenCount;
        break;
      } else {
        break;
      }
    }

    // Format included chunks
    if (includedChunks.length > 0) {
      context = includedChunks
        .map(chunk => this.formatChunkForContext(chunk.source, chunk.content))
        .join('\\n\\n---\\n\\n');
    }

    return context;
  }

  /**
   * Create summary of multiple chunks
   */
  createSummary(chunkIds: string[], summaryId?: string): ContextSummary {
    const chunks = chunkIds.map(id => this.chunks.get(id)).filter(Boolean) as ContextChunk[];
    
    if (chunks.length === 0) {
      throw new Error('No valid chunks found for summary');
    }

    const combinedContent = chunks.map(c => c.content).join('\\n\\n');
    const targetLength = Math.floor(combinedContent.length * this.compressionRatio);
    
    // Simple summary generation (in production, this would use a summarization model)
    const summary = this.generateTextSummary(combinedContent, targetLength);
    
    const contextSummary: ContextSummary = {
      id: summaryId || this.generateSummaryId(),
      originalChunks: chunkIds,
      summary,
      tokenCount: this.estimateTokens(summary),
      createdAt: new Date(),
    };

    this.summaries.set(contextSummary.id, contextSummary);
    return contextSummary;
  }

  /**
   * Get context statistics
   */
  getStats(): {
    totalChunks: number;
    totalTokens: number;
    averageChunkSize: number;
    largestChunk: number;
    summaryCount: number;
  } {
    const chunks = Array.from(this.chunks.values());
    const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
    const largestChunk = Math.max(...chunks.map(c => c.tokenCount), 0);
    
    return {
      totalChunks: chunks.length,
      totalTokens,
      averageChunkSize: chunks.length > 0 ? totalTokens / chunks.length : 0,
      largestChunk,
      summaryCount: this.summaries.size,
    };
  }

  /**
   * Clear all context data
   */
  clear(): void {
    this.chunks.clear();
    this.summaries.clear();
  }

  private async findFiles(
    dirPath: string, 
    extensions: string[], 
    exclude: string[], 
    maxFiles: number
  ): Promise<string[]> {
    const files: string[] = [];
    
    const processDir = async (currentPath: string): Promise<void> => {
      if (files.length >= maxFiles) return;
      
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (files.length >= maxFiles) break;
        
        const fullPath = path.join(currentPath, entry.name);
        
        if (entry.isDirectory()) {
          const shouldExclude = exclude.some(pattern => 
            entry.name.includes(pattern) || fullPath.includes(pattern)
          );
          
          if (!shouldExclude) {
            await processDir(fullPath);
          }
        } else if (entry.isFile()) {
          const hasValidExtension = extensions.some(ext => entry.name.endsWith(ext));
          
          if (hasValidExtension) {
            files.push(fullPath);
          }
        }
      }
    };

    await processDir(dirPath);
    return files;
  }

  private calculateRelevanceScore(chunk: ContextChunk, query: string): number {
    const queryLower = query.toLowerCase();
    const contentLower = chunk.content.toLowerCase();
    const sourceLower = chunk.source.toLowerCase();
    
    let score = 0;
    
    // Base importance score
    score += chunk.importance;
    
    // Content relevance
    const queryWords = queryLower.split(/\\s+/);
    for (const word of queryWords) {
      if (word.length > 2) {
        const contentMatches = (contentLower.match(new RegExp(word, 'g')) || []).length;
        const sourceMatches = (sourceLower.match(new RegExp(word, 'g')) || []).length;
        
        score += contentMatches * 0.1;
        score += sourceMatches * 0.5; // Source name matches are more important
      }
    }
    
    // Recent content bonus
    const age = Date.now() - chunk.timestamp.getTime();
    const ageBonus = Math.max(0, 1 - age / (24 * 60 * 60 * 1000)); // Decay over 24 hours
    score += ageBonus * 0.5;
    
    return score;
  }

  private createChunkSummary(chunk: ContextChunk, maxTokens: number): ContextSummary {
    const targetLength = Math.floor(chunk.content.length * (maxTokens / chunk.tokenCount));
    const summary = this.generateTextSummary(chunk.content, targetLength);
    
    return {
      id: this.generateSummaryId(),
      originalChunks: [chunk.id],
      summary,
      tokenCount: this.estimateTokens(summary),
      createdAt: new Date(),
    };
  }

  private generateTextSummary(text: string, targetLength: number): string {
    // Simple extractive summarization
    // In production, this would use a proper summarization model
    
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    if (sentences.length <= 3) {
      return text;
    }
    
    // Score sentences by position and length
    const scoredSentences = sentences.map((sentence, index) => {
      let score = 0;
      
      // Position score (beginning and end are important)
      if (index < sentences.length * 0.2) score += 2;
      if (index > sentences.length * 0.8) score += 1;
      
      // Length score (medium-length sentences preferred)
      const length = sentence.trim().length;
      if (length > 50 && length < 200) score += 1;
      
      return { sentence: sentence.trim(), score, index };
    });
    
    // Select top sentences up to target length
    scoredSentences.sort((a, b) => b.score - a.score);
    
    let summary = '';
    let currentLength = 0;
    
    for (const { sentence } of scoredSentences) {
      if (currentLength + sentence.length <= targetLength) {
        summary += sentence + '. ';
        currentLength += sentence.length + 2;
      }
    }
    
    return summary.trim() || text.substring(0, targetLength);
  }

  private formatChunkForContext(source: string, content: string): string {
    return `## ${source}\\n\\n${content}`;
  }

  private estimateTokens(text: string): number {
    // Simple token estimation: roughly 4 characters per token
    return Math.ceil(text.length / 4);
  }

  private generateChunkId(): string {
    return `chunk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSummaryId(): string {
    return `summary-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}