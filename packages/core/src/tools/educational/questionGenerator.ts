/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from '../tools.js';
import { Config } from '../../config/config.js';
import { getErrorMessage } from '../../utils/errors.js';
import { SchemaValidator } from '../../utils/schemaValidator.js';
import { SchemaUnion } from '@google/genai';
import { AdaptiveQuestionGenerator } from './adaptiveQuestionGenerator.js';

/**
 * 質問生成のためのパラメータ
 */
export interface QuestionGenerationParams {
  /** 現在のフェーズ */
  phase: 'discovery' | 'assessment';
  /** 学習分野 */
  subject: string;
  /** これまでの質問と回答の履歴 */
  previousQuestions: Array<{
    question: string;
    answer: string;
    type: 'discovery' | 'assessment' | 'open-ended';
  }>;
  /** 質問タイプ */
  questionType: 'discovery' | 'assessment' | 'open-ended';
  /** ユーザーの現在の理解レベル（推定） */
  currentLevel?: 'beginner' | 'intermediate' | 'advanced';
}

/**
 * 生成された質問の結果
 */
export interface QuestionGenerationResult {
  /** 生成された質問 */
  question: string;
  /** 提案選択肢（最大4つ） */
  suggestedOptions: string[];
  /** 質問タイプ */
  type: 'discovery' | 'assessment' | 'open-ended';
  /** 正解（評価問題の場合） */
  correctAnswer?: string;
  /** 正解の解説 */
  explanation?: string;
  /** AIが判断する情報収集の十分性 */
  isInformationSufficient?: boolean;
  /** 次のフェーズへの移行提案 */
  suggestedNextPhase?: 'assessment' | 'path-generation';
}

/**
 * ツール実行結果（ToolResult準拠）
 */
export interface QuestionGenerationToolResult extends ToolResult {
  /** 生成された質問データ */
  questionData: QuestionGenerationResult;
}

/**
 * AI質問生成ツール
 * Phase 3: 実際のGemini APIを使用した動的質問生成
 */
export class QuestionGeneratorTool extends BaseTool<
  QuestionGenerationParams,
  QuestionGenerationToolResult
> {
  static readonly Name = 'generate_learning_question';
  private adaptiveGenerator: AdaptiveQuestionGenerator;
  private useAdaptiveMode: boolean = true; // 適応的質問生成を優先

  constructor(private readonly config: Config, useAdaptiveMode: boolean = true) {
    super(
      QuestionGeneratorTool.Name,
      '学習用質問生成（適応的モード対応）',
      'ユーザーの学習状況に応じた適応的質問を動的に生成します',
      {
        type: 'object',
        properties: {
          phase: {
            type: 'string',
            enum: ['discovery', 'assessment'],
            description: '現在の学習フェーズ',
          },
          subject: {
            type: 'string',
            description: '学習対象分野',
          },
          previousQuestions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                question: { type: 'string' },
                answer: { type: 'string' },
                type: { type: 'string', enum: ['discovery', 'assessment', 'open-ended'] },
              },
              required: ['question', 'answer', 'type'],
            },
            description: 'これまでの質問と回答の履歴',
          },
          questionType: {
            type: 'string',
            enum: ['discovery', 'assessment', 'open-ended'],
            description: '生成する質問のタイプ',
          },
          currentLevel: {
            type: 'string',
            enum: ['beginner', 'intermediate', 'advanced'],
            description: 'ユーザーの推定理解レベル',
          },
        },
        required: ['phase', 'subject', 'previousQuestions', 'questionType'],
      },
      true,
      false
    );
    this.useAdaptiveMode = useAdaptiveMode;
    this.adaptiveGenerator = new AdaptiveQuestionGenerator(config);
  }

  validateToolParams(params: QuestionGenerationParams): string | null {
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
    
    if (!['discovery', 'assessment'].includes(params.phase)) {
      return 'Phase must be either "discovery" or "assessment".';
    }
    
    if (!['discovery', 'assessment', 'open-ended'].includes(params.questionType)) {
      return 'Question type must be "discovery", "assessment", or "open-ended".';
    }
    
    if (!Array.isArray(params.previousQuestions)) {
      return 'Previous questions must be an array.';
    }
    
    if (params.currentLevel && !['beginner', 'intermediate', 'advanced'].includes(params.currentLevel)) {
      return 'Current level must be "beginner", "intermediate", or "advanced".';
    }
    
    return null;
  }

  /**
   * AI応答のためのJSON Schema定義
   */
  private get responseSchema(): SchemaUnion {
    return {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: '生成された質問文',
        },
        suggestedOptions: {
          type: 'array',
          items: { type: 'string' },
          description: '選択肢（最大4つ）',
          maxItems: 4,
        },
        type: {
          type: 'string',
          enum: ['discovery', 'assessment', 'open-ended'],
          description: '質問タイプ',
        },
        correctAnswer: {
          type: 'string',
          description: '正解（評価問題の場合のみ）',
        },
        explanation: {
          type: 'string',
          description: '正解の解説（評価問題の場合のみ）',
        },
        isInformationSufficient: {
          type: 'boolean',
          description: 'AIが判断する情報収集の十分性（深堀りフェーズの場合のみ）',
        },
        suggestedNextPhase: {
          type: 'string',
          enum: ['assessment', 'path-generation'],
          description: '次のフェーズへの移行提案',
        },
      },
      required: ['question', 'suggestedOptions', 'type'],
    };
  }

  async execute(
    params: QuestionGenerationParams,
    signal?: AbortSignal
  ): Promise<QuestionGenerationToolResult> {
    try {
      let questionData: QuestionGenerationResult;

      // 適応的質問生成を優先的に使用
      if (this.useAdaptiveMode) {
        try {
          questionData = await this.generateAdaptiveQuestion(params, signal);
        } catch (adaptiveError) {
          console.warn('Adaptive question generation failed, falling back to standard method:', adaptiveError);
          questionData = await this.generateQuestionWithGeminiAPI(params, signal);
        }
      } else {
        // 従来の方法
        questionData = await this.generateQuestionWithGeminiAPI(params, signal);
      }
      
      return {
        llmContent: [{ text: `Generated question: ${questionData.question}` }],
        returnDisplay: `Question: ${questionData.question}\nOptions: ${questionData.suggestedOptions.join(', ')}`,
        questionData,
        uiComponents: {
          type: 'question-selector',
          question: questionData.question,
          options: questionData.suggestedOptions,
          allowCustomInput: questionData.type === 'discovery', // 深堀りフェーズのみ自由入力を許可
          placeholder: questionData.type === 'discovery' ? 'その他（自由入力）' : undefined,
        },
        awaitingUserInput: true,
        onUserInput: async (userAnswer: string) => {
          return this.handleUserAnswer(userAnswer, questionData, params);
        },
      };
    } catch (error) {
      const errorMessage = `Failed to generate question: ${getErrorMessage(error)}`;
      const fallbackQuestionData = this.generateFallbackQuestion(params);
      return {
        llmContent: [{ text: `Error: ${errorMessage}` }],
        returnDisplay: `Error: ${errorMessage}`,
        questionData: fallbackQuestionData,
        uiComponents: {
          type: 'question-selector',
          question: 'エラーが発生しました。基本的な質問を表示します。',
          options: ['続行する', 'やり直す'],
          allowCustomInput: false,
        },
        awaitingUserInput: true,
        onUserInput: async (userAnswer: string) => {
          return this.handleUserAnswer(userAnswer, fallbackQuestionData, params);
        },
      };
    }
  }

  /**
   * 実際のGemini APIを使用して質問を生成
   */
  private async generateQuestionWithGeminiAPI(
    params: QuestionGenerationParams,
    signal?: AbortSignal
  ): Promise<QuestionGenerationResult> {
    const geminiClient = this.config.getGeminiClient();
    const prompt = this.buildQuestionGenerationPrompt(params);
    
    // AbortSignalのチェック
    if (signal?.aborted) {
      throw new Error('Operation was aborted');
    }

    try {
      // generateJson を使用してJSONレスポンスを取得
      const response = await geminiClient.generateJson(
        [{ role: 'user', parts: [{ text: prompt }] }],
        this.responseSchema,
        signal || new AbortController().signal
      );

      // AbortSignalの再チェック
      if (signal?.aborted) {
        throw new Error('Operation was aborted');
      }

      // AI応答を解析して結果オブジェクトを生成
      return this.parseQuestionResponse(response, params);
    } catch (error) {
      // エラーをログに記録して再スロー
      console.error('Error calling Gemini API for question generation:', error);
      throw error;
    }
  }

  /**
   * 質問データのみを取得するヘルパーメソッド
   */
  async getQuestionData(params: QuestionGenerationParams): Promise<QuestionGenerationResult> {
    const result = await this.execute(params);
    return result.questionData;
  }

  /**
   * 質問生成用のプロンプトを構築
   */
  private buildQuestionGenerationPrompt(params: QuestionGenerationParams): string {
    const { phase, subject, previousQuestions, questionType, currentLevel } = params;

    let prompt = `あなたはSensei-AI、適応型学習アシスタントです。ユーザーの学習状況に応じた質問を生成してください。

## 現在の状況
- 学習分野: ${subject}
- 現在のフェーズ: ${phase === 'discovery' ? '深堀りフェーズ（学習目標と背景の理解）' : '理解度評価フェーズ（現在の知識レベルの確認）'}
- 質問タイプ: ${questionType}
- 推定理解レベル: ${currentLevel || '不明'}

## これまでの質問と回答`;

    if (previousQuestions.length > 0) {
      previousQuestions.forEach((qa, index) => {
        prompt += `
${index + 1}. 質問: ${qa.question}
   回答: ${qa.answer}
   タイプ: ${qa.type}`;
      });
    } else {
      prompt += '\n（まだ質問は行われていません）';
    }

    if (phase === 'discovery') {
      prompt += `

## 深堀りフェーズでの質問生成指針
以下の観点から次の質問を生成してください：
1. **学習動機**: なぜこの分野を学びたいのか
2. **具体的目標**: どのレベルまで習得したいのか
3. **学習期間**: どのくらいの期間で習得したいのか
4. **現在の知識**: どの程度の前提知識があるのか
5. **学習スタイル**: どのような学習方法を好むのか

質問は以下の要件を満たしてください：
- ユーザーが答えやすい具体的な質問
- 4つの選択肢を提供（「その他」は自動追加されるので含めない）
- 前回までの回答を踏まえた発展的な内容
- 情報収集が十分な場合は、isInformationSufficient: true を設定`;

    } else if (phase === 'assessment') {
      prompt += `

## 理解度評価フェーズでの質問生成指針
${subject}分野の理解度を評価する問題を生成してください：
1. **基礎概念の理解**: 基本的な用語や概念の理解度
2. **応用力**: 概念を実際の問題に適用できるか
3. **関連性の理解**: 他の概念との関係性を理解しているか

問題は以下の要件を満たしてください：
- 明確な正解がある問題
- 4つの選択肢（1つの正解と3つの誤答）
- 正解の解説も含める
- ${currentLevel || 'beginner'}レベルに適した難易度`;
    }

    prompt += `

## 出力形式
以下のJSON形式で回答してください：
\`\`\`json
{
  "question": "生成された質問",
  "suggestedOptions": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
  "type": "${questionType}",
  ${questionType === 'assessment' ? '"correctAnswer": "正解の選択肢",\n  "explanation": "正解の解説",\n  ' : ''}${phase === 'discovery' ? '"isInformationSufficient": false,\n  "suggestedNextPhase": "assessment",' : ''}
}
\`\`\`

重要: 
- 質問は日本語で自然な表現にしてください
- 選択肢は具体的で理解しやすいものにしてください
- ${phase === 'discovery' ? '十分な情報が収集できたと判断する場合のみ、isInformationSufficient を true にしてください' : '正解は必ず選択肢の中から選んでください'}`;

    return prompt;
  }

  /**
   * AIの応答を解析して結果オブジェクトを生成
   * Phase 3: 実際のLLM応答を解析
   */
  private parseQuestionResponse(
    aiResponse: any,
    params: QuestionGenerationParams
  ): QuestionGenerationResult {
    // AI応答の基本的な検証
    if (!aiResponse || typeof aiResponse !== 'object') {
      throw new Error('Invalid AI response: response is not an object');
    }

    const { question, suggestedOptions, type, correctAnswer, explanation, isInformationSufficient, suggestedNextPhase } = aiResponse;

    // 必須フィールドの検証
    if (!question || typeof question !== 'string') {
      throw new Error('Invalid AI response: missing or invalid question');
    }

    if (!Array.isArray(suggestedOptions) || suggestedOptions.length === 0) {
      throw new Error('Invalid AI response: missing or invalid suggestedOptions');
    }

    if (!type || !['discovery', 'assessment', 'open-ended'].includes(type)) {
      throw new Error('Invalid AI response: missing or invalid type');
    }

    // 評価問題の場合の追加検証
    if (type === 'assessment') {
      if (!correctAnswer || typeof correctAnswer !== 'string') {
        throw new Error('Invalid AI response: assessment questions must have a correctAnswer');
      }

      // 正解が選択肢に含まれているかチェック
      if (!suggestedOptions.includes(correctAnswer)) {
        throw new Error('Invalid AI response: correctAnswer must be one of the suggestedOptions');
      }
    }

    // 結果オブジェクトを構築
    const result: QuestionGenerationResult = {
      question: question.trim(),
      suggestedOptions: suggestedOptions.map((option: any) => String(option).trim()),
      type: type as QuestionGenerationResult['type'],
    };

    // オプションフィールドを追加
    if (correctAnswer && type === 'assessment') {
      result.correctAnswer = correctAnswer.trim();
    }

    if (explanation && type === 'assessment') {
      result.explanation = explanation.trim();
    }

    if (typeof isInformationSufficient === 'boolean' && params.phase === 'discovery') {
      result.isInformationSufficient = isInformationSufficient;
    }

    if (suggestedNextPhase && ['assessment', 'path-generation'].includes(suggestedNextPhase)) {
      result.suggestedNextPhase = suggestedNextPhase as 'assessment' | 'path-generation';
    }

    return result;
  }

  /**
   * AI統合前のフォールバック質問生成
   */
  private generateFallbackQuestion(params: QuestionGenerationParams): QuestionGenerationResult {
    const { phase, subject, previousQuestions, questionType } = params;

    if (phase === 'discovery') {
      const discoveryQuestions = [
        {
          question: `${subject}を学習する主な目的は何ですか？`,
          options: [
            '仕事やキャリアアップのため',
            '個人的な興味や趣味として',
            '学校の課題や試験対策のため',
            '他の分野の理解を深めるため'
          ]
        },
        {
          question: `${subject}についての現在の知識レベルはどの程度ですか？`,
          options: [
            '全くの初心者（基本用語も知らない）',
            '少し知識がある（入門書を読んだ程度）',
            'ある程度理解している（基礎は身についている）',
            '結構詳しい（応用的な内容も理解できる）'
          ]
        },
        {
          question: `どのくらいの期間で習得したいですか？`,
          options: [
            '1-2週間程度で基礎を理解したい',
            '1-3ヶ月で実用的なレベルに到達したい',
            '半年から1年かけてしっかりと学びたい',
            '特に期限は設けていない'
          ]
        },
        {
          question: `どのような学習方法を好みますか？`,
          options: [
            '理論から入って段階的に理解を深める',
            '実践的な例から入って概念を学ぶ',
            '問題を解きながら学習する',
            '視覚的な資料（図表、動画）を活用する'
          ]
        }
      ];

      const questionIndex = Math.min(previousQuestions.length, discoveryQuestions.length - 1);
      const selectedQuestion = discoveryQuestions[questionIndex];

      return {
        question: selectedQuestion.question,
        suggestedOptions: selectedQuestion.options,
        type: 'discovery',
        isInformationSufficient: previousQuestions.length >= 3,
        suggestedNextPhase: previousQuestions.length >= 3 ? 'assessment' : undefined,
      };
    }

    // assessment フェーズの場合
    const assessmentQuestions = this.generateAssessmentQuestion(subject, previousQuestions.length);
    return assessmentQuestions;
  }

  /**
   * 理解度評価問題を生成
   */
  private generateAssessmentQuestion(subject: string, questionIndex: number): QuestionGenerationResult {
    // 分野別の基本的な評価問題テンプレート
    const subjectTemplates: Record<string, Array<{
      question: string;
      options: string[];
      correctAnswer: string;
      explanation: string;
    }>> = {
      '数学・統計学': [
        {
          question: '線形代数における「ベクトル空間」の基本的な性質として正しいものはどれですか？',
          options: [
            'ベクトルの加法と数倍に対して閉じている',
            'すべてのベクトルが同じ長さを持つ',
            'ベクトルは必ず3次元である',
            'ベクトルの順序は重要ではない'
          ],
          correctAnswer: 'ベクトルの加法と数倍に対して閉じている',
          explanation: 'ベクトル空間の定義として、ベクトルの加法と数倍（スカラー倍）に対して閉じていることが重要な性質です。'
        }
      ],
      'プログラミング・コンピューターサイエンス': [
        {
          question: 'オブジェクト指向プログラミングの基本概念として正しいものはどれですか？',
          options: [
            'カプセル化、継承、ポリモーフィズム',
            'ループ、条件分岐、関数',
            'HTML、CSS、JavaScript',
            'データベース、サーバー、クライアント'
          ],
          correctAnswer: 'カプセル化、継承、ポリモーフィズム',
          explanation: 'オブジェクト指向プログラミングの三大要素は、カプセル化（隠蔽）、継承、ポリモーフィズム（多態性）です。'
        }
      ],
      default: [
        {
          question: `${subject}の学習において最も重要だと思う要素はどれですか？`,
          options: [
            '基礎概念の正確な理解',
            '実践的な応用能力',
            '関連分野との関係性の理解',
            '最新の動向やトレンドの把握'
          ],
          correctAnswer: '基礎概念の正確な理解',
          explanation: 'どの分野においても、まず基礎概念を正確に理解することが、その後の学習の土台となります。'
        }
      ]
    };

    // 該当する分野のテンプレートを取得、なければデフォルトを使用
    let templates = subjectTemplates[subject];
    if (!templates) {
      // 部分マッチを試行
      const matchedKey = Object.keys(subjectTemplates).find(key => 
        key !== 'default' && (subject.includes(key) || key.includes(subject))
      );
      templates = matchedKey ? subjectTemplates[matchedKey] : subjectTemplates.default;
    }

    const questionTemplate = templates[questionIndex % templates.length];

    return {
      question: questionTemplate.question,
      suggestedOptions: questionTemplate.options,
      type: 'assessment',
      correctAnswer: questionTemplate.correctAnswer,
      explanation: questionTemplate.explanation,
    };
  }

  /**
   * プロンプト文字列を取得（外部からの利用用）
   */
  getPromptForExternalCall(params: QuestionGenerationParams): string {
    return this.buildQuestionGenerationPrompt(params);
  }

  /**
   * 適応的質問生成（新機能）
   */
  private async generateAdaptiveQuestion(
    params: QuestionGenerationParams,
    signal?: AbortSignal
  ): Promise<QuestionGenerationResult> {
    if (signal?.aborted) {
      throw new Error('Operation was aborted');
    }

    // 従来のパラメータを適応的形式に変換
    const adaptiveAnswers = params.previousQuestions.map((q, index) => ({
      questionId: `legacy_${index}`,
      selectedValue: q.answer,
      responseTime: 45, // デフォルト値
      answeredAt: new Date()
    }));

    try {
      if (params.phase === 'discovery') {
        // 深堀りフェーズでは適応的発見質問を生成
        const adaptiveParams = {
          subject: params.subject,
          previousAnswers: adaptiveAnswers,
          userProfile: this.createDefaultUserProfile(),
          diversityMode: adaptiveAnswers.length >= 2 // 2問目以降は多様性を重視
        };

        const adaptiveQuestion = await this.adaptiveGenerator.generateAdaptiveDiscoveryQuestion(adaptiveParams);
        return this.convertAdaptiveToLegacy(adaptiveQuestion);

      } else if (params.phase === 'assessment') {
        // 理解度評価フェーズでは適応的評価問題を生成
        const config = {
          minItems: 2,
          maxItems: 5,
          maxStandardError: 0.5,
          difficultyRange: ['beginner', 'advanced'] as [any, any],
          itemSelectionMethod: 'maximum-information' as const,
          abilityEstimationMethod: 'maximum-likelihood' as const
        };

        const adaptiveQuestion = await this.adaptiveGenerator.generateAdaptiveAssessmentQuestion(
          params.subject,
          adaptiveAnswers,
          config
        );
        return this.convertAdaptiveToLegacy(adaptiveQuestion);
      }

      throw new Error(`Unsupported phase: ${params.phase}`);

    } catch (error) {
      console.error('Adaptive question generation error:', error);
      throw error;
    }
  }

  /**
   * 適応的質問を従来形式に変換
   */
  private convertAdaptiveToLegacy(adaptiveQuestion: any): QuestionGenerationResult {
    return {
      question: adaptiveQuestion.question,
      suggestedOptions: adaptiveQuestion.options.map((opt: any) => opt.label),
      type: this.mapAdaptiveTypeToLegacy(adaptiveQuestion.type),
      correctAnswer: adaptiveQuestion.correctAnswer,
      explanation: adaptiveQuestion.explanation,
      isInformationSufficient: false, // 適応的システムで判定
      suggestedNextPhase: undefined,
    };
  }

  /**
   * 適応的問題タイプを従来形式にマッピング
   */
  private mapAdaptiveTypeToLegacy(adaptiveType: string): 'discovery' | 'assessment' | 'open-ended' {
    switch (adaptiveType) {
      case 'multiple-choice':
      case 'scenario-based':
        return 'assessment';
      case 'self-assessment':
      case 'text-comprehension':
      case 'adaptive-discovery':
        return 'discovery';
      case 'open-ended':
        return 'open-ended';
      default:
        return 'discovery';
    }
  }

  /**
   * デフォルトユーザープロファイルの作成
   */
  private createDefaultUserProfile(): any {
    return {
      motivationLevel: 0.7,
      learningStyle: {
        theoretical: 0.5,
        practical: 0.5,
        visual: 0.5,
        collaborative: 0.5,
      },
      timeConstraints: {
        hasDeadline: false,
        urgencyLevel: 0.5,
        availableTime: 10,
      },
      interests: [],
      knowledgeDomains: [],
    };
  }

  /**
   * 適応モードの切り替え
   */
  setAdaptiveMode(enabled: boolean): void {
    this.useAdaptiveMode = enabled;
  }

  /**
   * 適応的質問生成器への直接アクセス
   */
  getAdaptiveGenerator(): AdaptiveQuestionGenerator {
    return this.adaptiveGenerator;
  }

  /**
   * ユーザーの回答を処理して最終結果を返す
   */
  private async handleUserAnswer(
    userAnswer: string,
    questionData: QuestionGenerationResult,
    originalParams: QuestionGenerationParams
  ): Promise<QuestionGenerationToolResult> {
    // 回答の評価とフィードバック生成
    let feedback = '';
    let isCorrect = false;

    if (questionData.type === 'assessment' && questionData.correctAnswer) {
      // 評価問題の場合、正誤判定
      isCorrect = userAnswer.toLowerCase().trim() === questionData.correctAnswer!.toLowerCase().trim() ||
                  questionData.suggestedOptions.findIndex(option => 
                    option.toLowerCase().trim() === userAnswer.toLowerCase().trim()
                  ) === questionData.suggestedOptions.findIndex(option =>
                    option.toLowerCase().trim() === questionData.correctAnswer!.toLowerCase().trim()
                  );
      
      feedback = isCorrect 
        ? `正解です！${questionData.explanation || ''}`
        : `不正解です。正解は「${questionData.correctAnswer}」です。${questionData.explanation || ''}`;
    } else {
      // 発見的質問の場合、回答を記録
      feedback = `回答「${userAnswer}」を記録しました。`;
    }

    // 次のステップの提案
    let nextStepSuggestion = '';
    if (questionData.isInformationSufficient) {
      nextStepSuggestion = '\n\n情報収集が十分に完了しました。理解度評価フェーズに進むことをお勧めします。';
    } else if (originalParams.phase === 'discovery') {
      nextStepSuggestion = '\n\nさらに詳しい情報を収集するために、追加の質問を生成できます。';
    }

    const finalResult: QuestionGenerationToolResult = {
      llmContent: [{ 
        text: `User answered: "${userAnswer}"\nFeedback: ${feedback}${nextStepSuggestion}` 
      }],
      returnDisplay: `回答: ${userAnswer}\n\n${feedback}${nextStepSuggestion}`,
      questionData: {
        ...questionData,
        // ユーザーの回答を記録（拡張）
        userAnswer,
        isCorrect: questionData.type === 'assessment' ? isCorrect : undefined,
      } as QuestionGenerationResult & { userAnswer: string; isCorrect?: boolean },
    };

    return finalResult;
  }
}