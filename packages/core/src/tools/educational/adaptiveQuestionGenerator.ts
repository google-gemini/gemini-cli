/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../../config/config.js';
// 適応的評価用の型定義（ローカル定義）
type DifficultyLevel = 'novice' | 'beginner' | 'intermediate' | 'advanced' | 'expert';
type ExtendedQuestionType = 'multiple-choice' | 'self-assessment' | 'text-comprehension' | 'scenario-based' | 'open-ended' | 'adaptive-discovery';
type SelfAssessmentLevel = 'yes' | 'mostly' | 'somewhat' | 'little';

interface AdaptiveQuestion {
  id: string;
  type: ExtendedQuestionType;
  difficulty: DifficultyLevel;
  question: string;
  context?: string;
  options: QuestionOption[];
  correctAnswer?: string;
  explanation?: string;
  assessedConcepts: string[];
  estimatedTime: number;
  weight: number;
}

interface QuestionOption {
  value: string;
  label: string;
  skillLevel?: number;
  description?: string;
}

interface AdaptiveAnswer {
  questionId: string;
  selectedValue: string;
  responseTime: number;
  confidence?: SelfAssessmentLevel;
  freeText?: string;
  answeredAt: Date;
}

interface AdaptiveDiscoveryParams {
  subject: string;
  previousAnswers: AdaptiveAnswer[];
  userProfile: UserLearningProfile;
  diversityMode: boolean;
}

interface UserLearningProfile {
  motivationLevel: number;
  learningStyle: {
    theoretical: number;
    practical: number;
    visual: number;
    collaborative: number;
  };
  timeConstraints: {
    hasDeadline: boolean;
    urgencyLevel: number;
    availableTime: number;
  };
  interests: string[];
  knowledgeDomains: string[];
}

interface AbilityEstimate {
  theta: number;
  standardError: number;
  confidenceInterval: [number, number];
  conceptScores: Map<string, number>;
  itemsAdministered: number;
}

interface AdaptiveAssessmentConfig {
  minItems: number;
  maxItems: number;
  maxStandardError: number;
  difficultyRange: [DifficultyLevel, DifficultyLevel];
  itemSelectionMethod: 'maximum-information' | 'bayesian' | 'random';
  abilityEstimationMethod: 'maximum-likelihood' | 'bayesian' | 'weighted-likelihood';
}

/**
 * 適応的質問生成エンジン
 * CAT (Computer Adaptive Testing) とマルチモーダル評価を実装
 */
export class AdaptiveQuestionGenerator {
  private config: Config;
  private questionPool: Map<string, AdaptiveQuestion[]> = new Map();
  private userProfile: UserLearningProfile | null = null;
  private abilityEstimate: AbilityEstimate | null = null;

  constructor(config: Config) {
    this.config = config;
    this.initializeQuestionPool();
  }

  /**
   * 適応的な深堀り質問を生成
   */
  async generateAdaptiveDiscoveryQuestion(params: AdaptiveDiscoveryParams): Promise<AdaptiveQuestion> {
    try {
      return await this.generateWithAI(params);
    } catch (error) {
      console.error('AI generation failed, using adaptive fallback:', error);
      return this.generateAdaptiveFallbackQuestion(params);
    }
  }

  /**
   * 適応的な理解度評価問題を生成
   */
  async generateAdaptiveAssessmentQuestion(
    subject: string,
    previousAnswers: AdaptiveAnswer[],
    config: AdaptiveAssessmentConfig
  ): Promise<AdaptiveQuestion> {
    // 能力推定を更新
    this.updateAbilityEstimate(previousAnswers);

    // 次の問題の難易度を決定
    const targetDifficulty = this.selectOptimalDifficulty(config);

    // 問題タイプを適応的に選択
    const questionType = this.selectQuestionType(previousAnswers);

    try {
      return await this.generateAssessmentWithAI(subject, targetDifficulty, questionType, previousAnswers);
    } catch (error) {
      console.error('AI generation failed, using adaptive fallback:', error);
      return this.generateAdaptiveAssessmentFallback(subject, targetDifficulty, questionType);
    }
  }

  /**
   * AIを使用した質問生成
   */
  private async generateWithAI(params: AdaptiveDiscoveryParams): Promise<AdaptiveQuestion> {
    const geminiClient = this.config.getGeminiClient();
    const prompt = this.buildAdaptiveDiscoveryPrompt(params);

    const schema = {
      type: "object" as const,
      properties: {
        id: { type: "string" },
        type: { type: "string", enum: ["adaptive-discovery", "self-assessment", "text-comprehension"] },
        difficulty: { type: "string", enum: ["novice", "beginner", "intermediate", "advanced", "expert"] },
        question: { type: "string" },
        context: { type: "string" },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              value: { type: "string" },
              label: { type: "string" },
              skillLevel: { type: "number" },
            },
            required: ["value", "label"]
          }
        },
        assessedConcepts: { type: "array", items: { type: "string" } },
        estimatedTime: { type: "number" },
        weight: { type: "number" }
      },
      required: ["id", "type", "difficulty", "question", "options", "assessedConcepts", "estimatedTime", "weight"]
    };

    const response = await geminiClient.generateJson(
      [{ role: 'user', parts: [{ text: prompt }] }],
      schema,
      new AbortController().signal
    );

    return this.parseAIResponse(response);
  }

  /**
   * 適応的深堀りプロンプトの構築
   */
  private buildAdaptiveDiscoveryPrompt(params: AdaptiveDiscoveryParams): string {
    const { subject, previousAnswers, userProfile, diversityMode } = params;

    let prompt = `あなたは適応的学習システムSensei-AIの質問生成エンジンです。ユーザーの学習目標を深く理解するための質問を生成してください。

## 学習分野
${subject}

## これまでの回答分析`;

    if (previousAnswers.length > 0) {
      prompt += '\n### 回答履歴:';
      previousAnswers.forEach((answer: AdaptiveAnswer, index: number) => {
        prompt += `\n${index + 1}. 回答: ${answer.selectedValue} (回答時間: ${answer.responseTime}秒)`;
        if (answer.confidence) {
          prompt += ` 確信度: ${answer.confidence}`;
        }
      });

      // 回答パターンの分析
      const averageResponseTime = previousAnswers.reduce((sum: number, a: AdaptiveAnswer) => sum + a.responseTime, 0) / previousAnswers.length;
      prompt += `\n\n### 分析された傾向:`;
      prompt += `\n- 平均回答時間: ${averageResponseTime.toFixed(1)}秒`;
      prompt += `\n- 回答の一貫性: ${this.analyzeConsistency(previousAnswers)}`;
    } else {
      prompt += '\n（まだ回答はありません）';
    }

    if (userProfile) {
      prompt += `\n\n## 推定ユーザープロファイル
- 学習動機レベル: ${userProfile.motivationLevel.toFixed(2)}
- 学習スタイル: 理論${(userProfile.learningStyle.theoretical * 100).toFixed(0)}% / 実践${(userProfile.learningStyle.practical * 100).toFixed(0)}%
- 時間制約: ${userProfile.timeConstraints.hasDeadline ? '期限あり' : '期限なし'}
- 関心領域: ${userProfile.interests.join(', ')}`;
    }

    prompt += `\n\n## 質問生成指針

### 避けるべき定型的質問:
- 「学習する目的は何ですか？」
- 「現在の知識レベルは？」
- 「どのくらいの期間で？」
- 「どのような学習方法を？」

### 生成すべき質問の特徴:
1. **個人化**: ユーザーの回答履歴を反映した個別的な質問
2. **深堀り**: 表面的でない、洞察を得られる質問
3. **多角的**: 異なる角度からの理解を促す質問
4. **文脈的**: ${subject}の具体的なコンテキストに基づく質問

### 推奨問題タイプ:
${diversityMode ? `
- **text-comprehension**: 「${subject}とは〇〇であり、〇〇なのです。」のような文章を提示し、理解度を「はい・まあまあ・あまり・すこし」で評価
- **scenario-based**: 具体的なシナリオを提示し、どう行動するかを問う
- **self-assessment**: 特定の概念について自己評価を求める
` : `
- **adaptive-discovery**: 前回の回答を踏まえた発展的な深堀り質問
`}

## 出力要件
以下のJSON形式で1つの質問を生成してください：

\`\`\`json
{
  "id": "unique_question_id",
  "type": "${diversityMode ? 'text-comprehension または scenario-based または self-assessment' : 'adaptive-discovery'}",
  "difficulty": "適切な難易度レベル",
  "question": "生成された質問文",
  ${diversityMode ? '"context": "文章理解問題の場合の説明文",\n  ' : ''}"options": [
    {
      "value": "option1",
      "label": "選択肢1のラベル",
      "skillLevel": 0.25
    },
    // ... 他の選択肢
  ],
  "assessedConcepts": ["測定したい概念1", "概念2"],
  "estimatedTime": 60,
  "weight": 1.0
}
\`\`\`

重要：
- 質問は日本語で自然に
- 前回までの回答内容を具体的に活用
- ${subject}の特定の領域に焦点を当てる
- 選択肢は4つまで、skillLevelで難易度を表現（0.0-1.0）`;

    return prompt;
  }

  /**
   * 適応的理解度評価問題の生成（AI）
   */
  private async generateAssessmentWithAI(
    subject: string,
    difficulty: DifficultyLevel,
    questionType: ExtendedQuestionType,
    previousAnswers: AdaptiveAnswer[]
  ): Promise<AdaptiveQuestion> {
    const geminiClient = this.config.getGeminiClient();
    const prompt = this.buildAdaptiveAssessmentPrompt(subject, difficulty, questionType, previousAnswers);

    const schema = {
      type: "object" as const,
      properties: {
        id: { type: "string" },
        type: { type: "string" },
        difficulty: { type: "string" },
        question: { type: "string" },
        context: { type: "string" },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              value: { type: "string" },
              label: { type: "string" },
              skillLevel: { type: "number" }
            },
            required: ["value", "label"]
          }
        },
        correctAnswer: { type: "string" },
        explanation: { type: "string" },
        assessedConcepts: { type: "array", items: { type: "string" } },
        estimatedTime: { type: "number" },
        weight: { type: "number" }
      },
      required: ["id", "type", "difficulty", "question", "options", "assessedConcepts", "estimatedTime", "weight"]
    };

    const response = await geminiClient.generateJson(
      [{ role: 'user', parts: [{ text: prompt }] }],
      schema,
      new AbortController().signal
    );

    return this.parseAIResponse(response);
  }

  /**
   * 適応的評価プロンプトの構築
   */
  private buildAdaptiveAssessmentPrompt(
    subject: string,
    difficulty: DifficultyLevel,
    questionType: ExtendedQuestionType,
    previousAnswers: AdaptiveAnswer[]
  ): string {
    const difficultyDescriptions = {
      novice: '完全初心者レベル（用語も知らない）',
      beginner: '初心者レベル（基本用語は知っている）', 
      intermediate: '中級者レベル（基礎概念を理解している）',
      advanced: '上級者レベル（応用的な内容も理解）',
      expert: '専門家レベル（深い理解と応用力）'
    };

    const typeDescriptions = {
      'multiple-choice': '4択問題（明確な正解がある）',
      'self-assessment': '理解度自己評価（はい・まあまあ・あまり・すこし）',
      'text-comprehension': '文章理解問題（説明文を読んで理解度を評価）',
      'scenario-based': 'シナリオベース問題（具体的状況での判断）',
      'open-ended': '自由記述（考えを説明してもらう）',
      'adaptive-discovery': '適応的深堀り質問'
    };

    let prompt = `${subject}分野の理解度評価問題を生成してください。

## 問題要件
- **難易度**: ${difficulty} (${(difficultyDescriptions as any)[difficulty]})
- **問題タイプ**: ${questionType} (${(typeDescriptions as any)[questionType]})
- **評価目的**: ユーザーの${subject}に関する理解度を正確に測定

## これまでの評価結果`;

    if (previousAnswers.length > 0) {
      const correctCount = previousAnswers.filter(a => a.selectedValue === 'correct').length;
      const accuracy = correctCount / previousAnswers.length;
      prompt += `\n- 正答率: ${(accuracy * 100).toFixed(1)}%`;
      prompt += `\n- 回答済み問題数: ${previousAnswers.length}`;
      
      if (this.abilityEstimate) {
        prompt += `\n- 推定能力値: ${this.abilityEstimate.theta.toFixed(2)} (標準誤差: ${this.abilityEstimate.standardError.toFixed(2)})`;
      }
    } else {
      prompt += `\n（初回の評価問題です）`;
    }

    prompt += `\n\n## 問題タイプ別の要件`;

    switch (questionType) {
      case 'text-comprehension':
        prompt += `\n### 文章理解問題
- ${subject}に関する短い説明文（2-3文）を提示
- 文章の理解度を4段階で評価
- 選択肢: "はい（完全に理解）", "まあまあ（大体理解）", "あまり（部分的理解）", "すこし（ほとんど理解していない）"
- ${difficulty}レベルに適した概念の文章を作成`;
        break;

      case 'self-assessment':
        prompt += `\n### 自己評価問題
- 特定の${subject}概念について自己評価を求める
- "○○について、あなたの理解度はどの程度ですか？"の形式
- 選択肢: "はい（自信がある）", "まあまあ（だいたい理解）", "あまり（あいまい）", "すこし（よくわからない）"`;
        break;

      case 'scenario-based':
        prompt += `\n### シナリオベース問題
- ${subject}に関する具体的な状況を提示
- その状況でどう行動・判断するかを問う
- 4つの選択肢で実用的な対応を評価`;
        break;

      default:
        prompt += `\n### 標準4択問題
- 明確な正解がある知識問題
- ${difficulty}レベルに適した内容
- 3つの誤答選択肢は間違いやすいものを含める`;
    }

    prompt += `\n\n## 出力形式
以下のJSON形式で問題を生成してください：

\`\`\`json
{
  "id": "assessment_${questionType}_${Date.now()}",
  "type": "${questionType}",
  "difficulty": "${difficulty}",
  "question": "問題文",
  ${questionType === 'text-comprehension' ? '"context": "理解してもらう文章",\n  ' : ''}"options": [
    {"value": "option1", "label": "選択肢1", "skillLevel": 0.8},
    {"value": "option2", "label": "選択肢2", "skillLevel": 0.6},
    {"value": "option3", "label": "選択肢3", "skillLevel": 0.4},
    {"value": "option4", "label": "選択肢4", "skillLevel": 0.2}
  ],
  ${questionType !== 'self-assessment' && questionType !== 'text-comprehension' ? '"correctAnswer": "正解の選択肢value",\n  "explanation": "正解の解説",\n  ' : ''}"assessedConcepts": ["評価する概念"],
  "estimatedTime": 90,
  "weight": 1.0
}
\`\`\`

重要：
- 問題は${difficulty}レベルに適切な難易度で
- 選択肢のskillLevelは推定される能力レベル（0.0-1.0）
- ${subject}の核心的な概念を評価する内容に`;

    return prompt;
  }

  /**
   * 最適難易度の選択（CAT）
   */
  private selectOptimalDifficulty(config: AdaptiveAssessmentConfig): DifficultyLevel {
    if (!this.abilityEstimate) {
      return 'beginner'; // 初回はbeginnerから開始
    }

    // θ（能力値）に基づいて最適難易度を選択
    const theta = this.abilityEstimate.theta;
    
    if (theta < -1.5) return 'novice';
    if (theta < -0.5) return 'beginner';
    if (theta < 0.5) return 'intermediate';
    if (theta < 1.5) return 'advanced';
    return 'expert';
  }

  /**
   * 問題タイプの適応的選択
   */
  private selectQuestionType(previousAnswers: AdaptiveAnswer[]): ExtendedQuestionType {
    if (previousAnswers.length === 0) {
      return 'multiple-choice'; // 初回は標準的な4択から
    }

    const recentTypes = previousAnswers.slice(-3).map(a => a.questionId.split('_')[1] as ExtendedQuestionType);
    const typeCounts = recentTypes.reduce((counts, type) => {
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    // 同じタイプが3回連続の場合は別のタイプを選択
    if (Math.max(...Object.values(typeCounts)) >= 3) {
      const availableTypes: ExtendedQuestionType[] = [
        'multiple-choice', 'self-assessment', 'text-comprehension', 'scenario-based'
      ];
      const unusedTypes = availableTypes.filter(type => !recentTypes.includes(type));
      if (unusedTypes.length > 0) {
        return unusedTypes[Math.floor(Math.random() * unusedTypes.length)];
      }
    }

    // 問題数に基づく戦略的選択
    const totalAnswers = previousAnswers.length;
    if (totalAnswers % 4 === 1) return 'text-comprehension';
    if (totalAnswers % 4 === 2) return 'self-assessment';
    if (totalAnswers % 4 === 3) return 'scenario-based';
    return 'multiple-choice';
  }

  /**
   * 能力推定の更新（簡易CAT実装）
   */
  private updateAbilityEstimate(answers: AdaptiveAnswer[]): void {
    if (answers.length === 0) {
      this.abilityEstimate = null;
      return;
    }

    // 簡易的な能力推定（実際のCATではより複雑なアルゴリズムを使用）
    const correctAnswers = answers.filter(a => a.selectedValue === 'correct').length;
    const accuracy = correctAnswers / answers.length;

    // 正答率からθ（能力値）を推定
    let theta: number;
    if (accuracy >= 0.9) theta = 2.0;
    else if (accuracy >= 0.75) theta = 1.0;
    else if (accuracy >= 0.6) theta = 0.5;
    else if (accuracy >= 0.4) theta = 0.0;
    else if (accuracy >= 0.25) theta = -0.5;
    else theta = -1.0;

    // 標準誤差を答えた問題数に基づいて計算
    const standardError = Math.max(0.3, 1.0 / Math.sqrt(answers.length));

    this.abilityEstimate = {
      theta,
      standardError,
      confidenceInterval: [theta - 1.96 * standardError, theta + 1.96 * standardError],
      conceptScores: new Map(),
      itemsAdministered: answers.length,
    };
  }

  /**
   * 回答の一貫性分析
   */
  private analyzeConsistency(answers: AdaptiveAnswer[]): string {
    if (answers.length < 2) return '不明';

    const responseTimes = answers.map(a => a.responseTime);
    const avgTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    const variance = responseTimes.reduce((sum: number, time: number) => sum + Math.pow(time - avgTime, 2), 0) / responseTimes.length;
    const cv = Math.sqrt(variance) / avgTime; // 変動係数

    if (cv < 0.3) return '高い（安定した回答パターン）';
    if (cv < 0.6) return '中程度';
    return '低い（回答時間がばらつく）';
  }

  /**
   * 適応的フォールバック質問生成
   */
  private generateAdaptiveFallbackQuestion(params: AdaptiveDiscoveryParams): AdaptiveQuestion {
    const { subject, previousAnswers, diversityMode } = params;
    const questionNumber = previousAnswers.length;

    // より動的なフォールバック質問
    const adaptiveQuestions = [
      {
        id: `discovery_adaptive_${Date.now()}_0`,
        question: `${subject}を学習する上で、最も興味を引かれる側面は何ですか？`,
        type: 'adaptive-discovery' as ExtendedQuestionType,
        options: [
          { value: 'theoretical', label: '理論的な基礎や原理', skillLevel: 0.8 },
          { value: 'practical', label: '実際の応用や実践方法', skillLevel: 0.6 },
          { value: 'creative', label: '創造的な活用や応用', skillLevel: 0.7 },
          { value: 'analytical', label: '分析的な思考や問題解決', skillLevel: 0.9 }
        ]
      },
      {
        id: `discovery_adaptive_${Date.now()}_1`,
        question: `${subject}について学習した結果、どのような状態になっていたいですか？`,
        type: 'adaptive-discovery' as ExtendedQuestionType,
        options: [
          { value: 'expert', label: '専門家として他の人に教えられるレベル', skillLevel: 0.9 },
          { value: 'competent', label: '実務で自信を持って使えるレベル', skillLevel: 0.7 },
          { value: 'conversational', label: '基本的な会話ができるレベル', skillLevel: 0.5 },
          { value: 'awareness', label: '概要を理解している程度', skillLevel: 0.3 }
        ]
      },
      {
        id: `discovery_comprehension_${Date.now()}`,
        question: `以下の文章を読んで、理解度をお答えください。`,
        type: 'text-comprehension' as ExtendedQuestionType,
        context: `${subject}は現代社会において重要な役割を果たしており、多くの分野で応用されています。その基本原理を理解することは、効果的な学習の第一歩となります。`,
        options: [
          { value: 'yes', label: 'はい（完全に理解できる）', skillLevel: 0.8 },
          { value: 'mostly', label: 'まあまあ（大体理解できる）', skillLevel: 0.6 },
          { value: 'somewhat', label: 'あまり（部分的にしか理解できない）', skillLevel: 0.4 },
          { value: 'little', label: 'すこし（ほとんど理解できない）', skillLevel: 0.2 }
        ]
      }
    ];

    const selectedIndex = diversityMode ? 2 : Math.min(questionNumber, adaptiveQuestions.length - 1);
    const question = adaptiveQuestions[selectedIndex];

    return {
      ...question,
      difficulty: 'beginner' as DifficultyLevel,
      assessedConcepts: ['学習動機', '目標設定', '理解度'],
      estimatedTime: 45,
      weight: 1.0,
    };
  }

  /**
   * 適応的評価フォールバック
   */
  private generateAdaptiveAssessmentFallback(
    subject: string,
    difficulty: DifficultyLevel,
    questionType: ExtendedQuestionType
  ): AdaptiveQuestion {
    // 基本的なフォールバック実装
    return {
      id: `assessment_fallback_${Date.now()}`,
      type: questionType,
      difficulty,
      question: `${subject}に関するあなたの理解度はどの程度ですか？`,
      options: [
        { value: 'expert', label: '専門家レベル', skillLevel: 0.9 },
        { value: 'advanced', label: '上級者レベル', skillLevel: 0.7 },
        { value: 'intermediate', label: '中級者レベル', skillLevel: 0.5 },
        { value: 'beginner', label: '初心者レベル', skillLevel: 0.3 }
      ],
      assessedConcepts: ['全般的理解度'],
      estimatedTime: 30,
      weight: 1.0,
    };
  }

  /**
   * AI応答の解析
   */
  private parseAIResponse(response: any): AdaptiveQuestion {
    // レスポンスの基本検証と変換
    return {
      id: response.id || `generated_${Date.now()}`,
      type: response.type || 'multiple-choice',
      difficulty: response.difficulty || 'beginner',
      question: response.question || 'デフォルト質問',
      context: response.context,
      options: response.options || [],
      correctAnswer: response.correctAnswer,
      explanation: response.explanation,
      assessedConcepts: response.assessedConcepts || [],
      estimatedTime: response.estimatedTime || 60,
      weight: response.weight || 1.0,
    };
  }

  /**
   * 質問プールの初期化
   */
  private initializeQuestionPool(): void {
    // 基本的な質問プールの設定
    // 実際の実装では、科目別の豊富な質問データベースを構築
  }

  /**
   * ユーザープロファイルの更新
   */
  updateUserProfile(answers: AdaptiveAnswer[]): void {
    // 回答履歴からユーザープロファイルを推定・更新
    if (answers.length === 0) return;

    const avgResponseTime = answers.reduce((sum: number, a: AdaptiveAnswer) => sum + a.responseTime, 0) / answers.length;
    
    this.userProfile = {
      motivationLevel: this.estimateMotivation(answers),
      learningStyle: {
        theoretical: this.estimateTheoreticalTendency(answers),
        practical: this.estimatePracticalTendency(answers),
        visual: 0.5, // デフォルト
        collaborative: 0.5, // デフォルト
      },
      timeConstraints: {
        hasDeadline: avgResponseTime < 30, // 速い回答は時間制約を示唆
        urgencyLevel: Math.max(0, 1 - avgResponseTime / 120),
        availableTime: Number(this.estimateAvailableTime(answers)),
      },
      interests: this.extractInterests(answers),
      knowledgeDomains: [],
    };
  }

  private estimateMotivation(answers: AdaptiveAnswer[]): number {
    // 回答時間と一貫性から動機レベルを推定
    const avgTime = answers.reduce((sum: number, a: AdaptiveAnswer) => sum + a.responseTime, 0) / answers.length;
    const consistency = this.analyzeConsistency(answers);
    
    if (consistency === '高い（安定した回答パターン）' && avgTime > 20 && avgTime < 60) {
      return 0.8;
    }
    return 0.6;
  }

  private estimateTheoreticalTendency(answers: AdaptiveAnswer[]): number {
    const theoreticalAnswers = answers.filter(a => 
      a.selectedValue.includes('理論') || a.selectedValue.includes('原理')
    );
    return theoreticalAnswers.length / answers.length;
  }

  private estimatePracticalTendency(answers: AdaptiveAnswer[]): number {
    const practicalAnswers = answers.filter(a => 
      a.selectedValue.includes('実践') || a.selectedValue.includes('応用')
    );
    return practicalAnswers.length / answers.length;
  }

  private estimateAvailableTime(answers: AdaptiveAnswer[]): number {
    // 回答パターンから推定可能な学習時間
    const avgResponseTime = answers.reduce((sum: number, a: AdaptiveAnswer) => sum + a.responseTime, 0) / answers.length;
    
    if (avgResponseTime < 20) return 5; // 忙しい → 週5時間
    if (avgResponseTime < 60) return 10; // 普通 → 週10時間
    return 20; // ゆっくり → 週20時間
  }

  private extractInterests(answers: AdaptiveAnswer[]): string[] {
    // 回答内容から関心領域を抽出
    const interests = new Set<string>();
    
    answers.forEach(answer => {
      if (answer.selectedValue.includes('理論')) interests.add('理論研究');
      if (answer.selectedValue.includes('実践')) interests.add('実践応用');
      if (answer.selectedValue.includes('創造')) interests.add('創造的活動');
      if (answer.selectedValue.includes('分析')) interests.add('分析的思考');
    });
    
    return Array.from(interests);
  }
}