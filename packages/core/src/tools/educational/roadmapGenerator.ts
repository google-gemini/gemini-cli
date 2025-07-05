/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from '../tools.js';
import { Config } from '../../config/config.js';
import { getErrorMessage } from '../../utils/errors.js';
import { SchemaValidator } from '../../utils/schemaValidator.js';

/**
 * ロードマップ生成のためのパラメータ
 */
export interface RoadmapGenerationParams {
  /** 学習分野 */
  subject: string;
  /** 学習目標 */
  goal: string;
  /** 深堀り質問への回答 */
  discoveryResponses: Array<{ question: string; answer: string }>;
  /** 理解度評価の結果 */
  assessmentResults: Array<{ question: string; answer: string; isCorrect: boolean }>;
  /** ユーザーの理解レベル */
  userLevel: 'beginner' | 'intermediate' | 'advanced';
  /** 希望学習期間（オプション） */
  desiredDuration?: string;
  /** 学習スタイル（オプション） */
  learningStyle?: string;
}

/**
 * ツール実行結果（ToolResult準拠）
 */
export interface RoadmapGenerationToolResult extends ToolResult {
  /** 生成されたロードマップデータ */
  roadmapData: RoadmapData;
}

/**
 * ロードマップ生成ツール
 * 学習の深堀りと理解度評価の結果から、グラフ構造の学習ロードマップを生成する
 */
export class RoadmapGeneratorTool extends BaseTool<
  RoadmapGenerationParams,
  RoadmapGenerationToolResult
> {
  static readonly Name = 'generate_roadmap';

  constructor(private readonly config: Config) {
    super(
      RoadmapGeneratorTool.Name,
      'ロードマップ生成',
      '学習の深堀りと理解度評価の結果から、個人に最適化された学習ロードマップを生成します',
      {
        type: 'object',
        properties: {
          subject: {
            type: 'string',
            description: '学習対象分野',
          },
          goal: {
            type: 'string',
            description: '学習目標',
          },
          discoveryResponses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                question: { type: 'string' },
                answer: { type: 'string' },
              },
              required: ['question', 'answer'],
            },
            description: '深堀り質問への回答',
          },
          assessmentResults: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                question: { type: 'string' },
                answer: { type: 'string' },
                isCorrect: { type: 'boolean' },
              },
              required: ['question', 'answer', 'isCorrect'],
            },
            description: '理解度評価の結果',
          },
          userLevel: {
            type: 'string',
            enum: ['beginner', 'intermediate', 'advanced'],
            description: 'ユーザーの理解レベル',
          },
          desiredDuration: {
            type: 'string',
            description: '希望学習期間（オプション）',
          },
          learningStyle: {
            type: 'string',
            description: '学習スタイル（オプション）',
          },
        },
        required: ['subject', 'goal', 'discoveryResponses', 'assessmentResults', 'userLevel'],
      },
      true,
      false
    );
  }

  validateToolParams(params: RoadmapGenerationParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation.';
    }
    
    if (!params.subject || params.subject.trim() === '') {
      return 'Subject cannot be empty.';
    }
    
    if (!params.goal || params.goal.trim() === '') {
      return 'Goal cannot be empty.';
    }
    
    if (!Array.isArray(params.discoveryResponses)) {
      return 'Discovery responses must be an array.';
    }
    
    if (!Array.isArray(params.assessmentResults)) {
      return 'Assessment results must be an array.';
    }
    
    if (!['beginner', 'intermediate', 'advanced'].includes(params.userLevel)) {
      return 'User level must be "beginner", "intermediate", or "advanced".';
    }
    
    return null;
  }

  async execute(
    params: RoadmapGenerationParams,
    signal?: AbortSignal
  ): Promise<RoadmapGenerationToolResult> {
    try {
      const roadmapData = await this.generateRoadmapData(params);
      
      return {
        llmContent: [{ text: `Generated roadmap for ${params.subject}: ${roadmapData.nodes.length} nodes, ${roadmapData.edges.length} connections` }],
        returnDisplay: `**🗺️ ${params.subject}の学習ロードマップが完成しました**\n\n- **総学習時間**: ${roadmapData.metadata.totalEstimatedTime}\n- **推奨ペース**: ${roadmapData.metadata.recommendedPace}\n- **学習ノード数**: ${roadmapData.nodes.length}個\n- **前提知識**: ${roadmapData.metadata.prerequisites.join(', ')}`,
        roadmapData,
        uiComponents: {
          type: 'roadmap-graph',
          roadmapData: roadmapData,
        },
      };
    } catch (error) {
      const errorMessage = `Failed to generate roadmap: ${getErrorMessage(error)}`;
      return {
        llmContent: [{ text: `Error: ${errorMessage}` }],
        returnDisplay: `Error: ${errorMessage}`,
        roadmapData: this.generateFallbackRoadmap(params),
        uiComponents: {
          type: 'roadmap-graph',
          roadmapData: this.generateFallbackRoadmap(params),
        },
      };
    }
  }

  /**
   * ロードマップデータを生成
   */
  async generateRoadmapData(params: RoadmapGenerationParams): Promise<RoadmapData> {
    try {
      return await this.generateRoadmapWithGeminiAPI(params);
    } catch (error) {
      console.error('Gemini API error:', error);
      return this.generateFallbackRoadmap(params);
    }
  }

  /**
   * Gemini APIを使用してロードマップを生成
   */
  private async generateRoadmapWithGeminiAPI(params: RoadmapGenerationParams): Promise<RoadmapData> {
    const geminiClient = this.config.getGeminiClient();
    const prompt = this.buildRoadmapPrompt(params);
    
    const roadmapSchema = {
      type: "object",
      properties: {
        nodes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              type: { type: "string", enum: ["topic", "milestone", "checkpoint"] },
              estimatedTime: { type: "string" },
              prerequisites: { type: "array", items: { type: "string" } },
              concepts: { type: "array", items: { type: "string" } },
              resources: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    type: { type: "string" },
                    description: { type: "string" }
                  },
                  required: ["title", "type"]
                }
              }
            },
            required: ["id", "title", "description", "type", "estimatedTime", "prerequisites"]
          }
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              type: { type: "string", enum: ["prerequisite", "recommended", "optional"] },
              weight: { type: "number" }
            },
            required: ["from", "to", "type", "weight"]
          }
        },
        metadata: {
          type: "object",
          properties: {
            totalEstimatedTime: { type: "string" },
            recommendedPace: { type: "string" },
            prerequisites: { type: "array", items: { type: "string" } }
          },
          required: ["totalEstimatedTime", "recommendedPace", "prerequisites"]
        }
      },
      required: ["nodes", "edges", "metadata"]
    };

    const response = await geminiClient.generateJson(
      [{ role: 'user', parts: [{ text: prompt }] }],
      roadmapSchema,
      new AbortController().signal
    );

    return response as unknown as RoadmapData;
  }

  /**
   * ロードマップ生成用のプロンプトを構築
   */
  private buildRoadmapPrompt(params: RoadmapGenerationParams): string {
    const { 
      subject, 
      goal, 
      discoveryResponses, 
      assessmentResults, 
      userLevel,
      desiredDuration,
      learningStyle 
    } = params;

    // 理解度評価の正解率を計算
    const correctCount = assessmentResults.filter((r: any) => r.isCorrect).length;
    const totalCount = assessmentResults.length;
    const accuracy = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;

    return `
あなたは教育カリキュラムの専門家です。以下の情報に基づいて、学習者のための詳細な学習ロードマップをグラフ構造で生成してください。

## 学習情報
- 分野: ${subject}
- 目標: ${goal}
- 現在のレベル: ${userLevel}
- 理解度評価の正解率: ${accuracy.toFixed(1)}%
${desiredDuration ? `- 希望学習期間: ${desiredDuration}` : ''}
${learningStyle ? `- 学習スタイル: ${learningStyle}` : ''}

## 深堀り質問への回答
${discoveryResponses.map((r: any, i: number) => `${i + 1}. ${r.question}\n   回答: ${r.answer}`).join('\n')}

## 理解度評価の結果
${assessmentResults.map((r: any, i: number) => `${i + 1}. ${r.question}\n   回答: ${r.answer} (${r.isCorrect ? '正解' : '不正解'})`).join('\n')}

## 要求事項
1. ノードは学習トピックを表し、以下の情報を含める:
   - 明確なタイトルと説明
   - 学習タイプ（topic/milestone/checkpoint）
   - 推定学習時間
   - 前提条件（他のノードIDのリスト）
   - 関連する概念
   - 学習リソース

2. エッジは学習の依存関係を表し、以下を含める:
   - 関係タイプ（prerequisite/recommended/optional）
   - 重要度（0-1の重み）

3. 以下の原則に従ってください:
   - 学習者の現在のレベルに適した内容から始める
   - 段階的に難易度を上げる
   - 実践的な演習を含める
   - 各ノードは1-2週間で完了できる分量にする

4. グラフ構造の要件:
   - DAG（有向非巡回グラフ）であること
   - ルートノードから始まり、最終目標に到達する明確なパスがあること
   - 並行して学習可能なトピックは同じ深さに配置

JSON形式で出力してください。`;
  }

  /**
   * フォールバックロードマップを生成
   */
  private generateFallbackRoadmap(params: RoadmapGenerationParams): RoadmapData {
    const { subject, goal, userLevel } = params;
    
    // 基本的なロードマップ構造を生成
    const baseNodes = this.generateBaseNodes(subject, userLevel);
    const edges = this.generateEdges(baseNodes);
    
    return {
      nodes: baseNodes,
      edges: edges,
      metadata: {
        totalEstimatedTime: this.calculateTotalTime(baseNodes),
        recommendedPace: userLevel === 'beginner' ? 'slow' : 'normal',
        prerequisites: this.extractPrerequisites(subject)
      }
    };
  }

  /**
   * 基本ノードを生成
   */
  private generateBaseNodes(subject: string, userLevel: string): RoadmapNode[] {
    // 汎用的な学習パスのテンプレート
    const beginnerNodes: RoadmapNode[] = [
      {
        id: 'intro',
        title: `${subject}入門`,
        description: `${subject}の基本概念と用語を学習`,
        type: 'topic',
        estimatedTime: '1週間',
        prerequisites: [],
        concepts: ['基本概念', '用語', '歴史'],
        resources: []
      },
      {
        id: 'basics',
        title: '基礎知識',
        description: '実践に必要な基礎的な知識を習得',
        type: 'topic',
        estimatedTime: '2週間',
        prerequisites: ['intro'],
        concepts: ['基本原理', '主要な要素'],
        resources: []
      },
      {
        id: 'practice1',
        title: '初級実践',
        description: '簡単な実践課題に取り組む',
        type: 'checkpoint',
        estimatedTime: '1週間',
        prerequisites: ['basics'],
        concepts: ['実践', 'ハンズオン'],
        resources: []
      }
    ];

    const intermediateNodes: RoadmapNode[] = [
      {
        id: 'advanced',
        title: '発展的内容',
        description: 'より高度な概念と技術を学習',
        type: 'topic',
        estimatedTime: '3週間',
        prerequisites: ['practice1'],
        concepts: ['高度な技術', '応用'],
        resources: []
      },
      {
        id: 'milestone1',
        title: '中級マイルストーン',
        description: 'これまでの学習内容を統合した課題',
        type: 'milestone',
        estimatedTime: '2週間',
        prerequisites: ['advanced'],
        concepts: ['統合', 'プロジェクト'],
        resources: []
      }
    ];

    if (userLevel === 'beginner') {
      return beginnerNodes;
    } else {
      return [...beginnerNodes.slice(1), ...intermediateNodes];
    }
  }

  /**
   * エッジを生成
   */
  private generateEdges(nodes: RoadmapNode[]): RoadmapEdge[] {
    const edges: RoadmapEdge[] = [];
    
    for (const node of nodes) {
      for (const prereq of node.prerequisites) {
        edges.push({
          from: prereq,
          to: node.id,
          type: 'prerequisite',
          weight: 1.0
        });
      }
    }
    
    return edges;
  }

  /**
   * 総学習時間を計算
   */
  private calculateTotalTime(nodes: RoadmapNode[]): string {
    const totalWeeks = nodes.reduce((sum, node) => {
      const match = node.estimatedTime.match(/(\d+)/);
      return sum + (match ? parseInt(match[1]) : 0);
    }, 0);
    
    if (totalWeeks >= 12) {
      return `約${Math.round(totalWeeks / 4)}ヶ月`;
    } else {
      return `約${totalWeeks}週間`;
    }
  }

  /**
   * 前提知識を抽出
   */
  private extractPrerequisites(subject: string): string[] {
    // 分野別の一般的な前提知識
    const prerequisites: { [key: string]: string[] } = {
      'プログラミング': ['基本的なコンピュータ操作', '論理的思考'],
      'Web開発': ['HTML/CSS基礎', 'JavaScript基礎'],
      'データサイエンス': ['数学基礎', '統計学基礎'],
      'デザイン': ['色彩理論', 'レイアウト基礎']
    };
    
    return prerequisites[subject] || ['基本的な学習意欲'];
  }

  /**
   * AI判定：情報が十分かどうかを判断
   */
  async isInformationSufficient(params: {
    discoveryResponses: any[];
    assessmentResults: any[];
  }): Promise<boolean> {
    // 簡易的な判定ロジック
    // 実際にはAIを使ってより高度な判定を行う
    const minDiscoveryQuestions = 3;
    const minAssessmentQuestions = 2;
    
    return params.discoveryResponses.length >= minDiscoveryQuestions &&
           params.assessmentResults.length >= minAssessmentQuestions;
  }
}

/**
 * 内部で使用する型定義
 */
interface RoadmapData {
  nodes: RoadmapNode[];
  edges: RoadmapEdge[];
  metadata: {
    totalEstimatedTime: string;
    recommendedPace: string;
    prerequisites: string[];
  };
}

interface RoadmapNode {
  id: string;
  title: string;
  description: string;
  type: 'topic' | 'milestone' | 'checkpoint';
  estimatedTime: string;
  prerequisites: string[];
  concepts: string[];
  resources: Array<{
    title: string;
    type: string;
    description?: string;
  }>;
}

interface RoadmapEdge {
  from: string;
  to: string;
  type: 'prerequisite' | 'recommended' | 'optional';
  weight: number;
}