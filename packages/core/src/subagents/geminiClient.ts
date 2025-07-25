/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Subagent } from '../config/subagents.js';

export interface GeminiRequest {
  prompt: string;
  context?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GeminiResponse {
  text: string;
  tokensUsed: number;
  model: string;
  finishReason: string;
}

export interface GeminiError {
  code: string;
  message: string;
  details?: any;
}

/**
 * Gemini APIクライアント
 */
export class GeminiClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private defaultTemperature: number;
  private defaultMaxTokens: number;

  constructor(options: {
    apiKey: string;
    baseUrl?: string;
    defaultModel?: string;
    defaultTemperature?: number;
    defaultMaxTokens?: number;
  }) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    this.defaultModel = options.defaultModel || 'models/gemini-1.5-flash';
    this.defaultTemperature = options.defaultTemperature || 0.7;
    this.defaultMaxTokens = options.defaultMaxTokens || 4096;
  }

  /**
   * サブエージェント用のプロンプトを生成
   */
  private generateSubagentPrompt(subagent: Subagent, task: string, context?: string): string {
    const specialtyDescription = this.getSpecialtyDescription(subagent.specialty);
    
    let prompt = `あなたは${subagent.name}という専門的なAIアシスタントです。
専門分野: ${specialtyDescription}

あなたの役割:
- ${subagent.description}
- 専門知識を活用して高品質な回答を提供
- 明確で実用的な解決策を提案

タスク: ${task}`;

    if (context) {
      prompt += `\n\nコンテキスト: ${context}`;
    }

    prompt += `\n\n専門的な視点から回答してください。`;

    return prompt;
  }

  /**
   * 専門分野の説明を取得
   */
  private getSpecialtyDescription(specialty: string): string {
    const descriptions: Record<string, string> = {
      'code_review': 'コードレビューと品質保証の専門家。バグの特定、セキュリティ問題の検出、コード品質の向上に特化',
      'debugging': 'デバッグとトラブルシューティングの専門家。エラーの原因特定と解決策の提案に特化',
      'data_analysis': 'データ分析と統計の専門家。データの可視化、統計解析、インサイトの抽出に特化',
      'documentation': 'ドキュメント作成の専門家。技術文書、API仕様書、ユーザーガイドの作成に特化',
      'testing': 'テスト戦略と品質保証の専門家。ユニットテスト、統合テスト、自動化テストの設計に特化',
      'optimization': 'パフォーマンス最適化の専門家。コード最適化、アルゴリズム改善、リソース効率化に特化',
      'security': 'セキュリティの専門家。脆弱性の特定、セキュリティベストプラクティスの提案に特化',
      'architecture': 'システム設計の専門家。スケーラブルで保守性の高いアーキテクチャの設計に特化'
    };

    return descriptions[specialty] || '汎用的なAIアシスタント';
  }

  /**
   * Gemini APIにリクエストを送信
   */
  async generateText(request: GeminiRequest): Promise<GeminiResponse> {
    const url = `${this.baseUrl}/models/${request.model || this.defaultModel}:generateContent`;
    
    const requestBody = {
      contents: [{
        parts: [{
          text: request.prompt
        }]
      }],
      generationConfig: {
        temperature: request.temperature || this.defaultTemperature,
        maxOutputTokens: request.maxTokens || this.defaultMaxTokens,
        topP: 0.8,
        topK: 40
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Gemini API Error: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('No response generated from Gemini API');
      }

      const candidate = data.candidates[0];
      const text = candidate.content?.parts?.[0]?.text || '';

      return {
        text,
        tokensUsed: data.usageMetadata?.totalTokenCount || 0,
        model: request.model || this.defaultModel,
        finishReason: candidate.finishReason || 'STOP'
      };

    } catch (error) {
      throw new Error(`Gemini API request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * サブエージェントのタスクを実行
   */
  async executeSubagentTask(
    subagent: Subagent, 
    task: string, 
    context?: string,
    options: Partial<GeminiRequest> = {}
  ): Promise<GeminiResponse> {
    const prompt = this.generateSubagentPrompt(subagent, task, context);
    
    return this.generateText({
      prompt,
      context,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens
    });
  }

  /**
   * 複数のサブエージェントで並列実行
   */
  async executeParallelTasks(
    subagents: Subagent[],
    task: string,
    context?: string,
    options: Partial<GeminiRequest> = {}
  ): Promise<Array<{ subagent: Subagent; response: GeminiResponse }>> {
    const promises = subagents.map(async (subagent) => {
      try {
        const response = await this.executeSubagentTask(subagent, task, context, options);
        return { subagent, response };
      } catch (error) {
        throw new Error(`Subagent ${subagent.name} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    return Promise.all(promises);
  }

  /**
   * APIキーの有効性を確認
   */
  async validateApiKey(): Promise<boolean> {
    try {
      await this.generateText({
        prompt: 'Hello',
        maxTokens: 10
      });
      return true;
    } catch (error) {
      return false;
    }
  }
} 