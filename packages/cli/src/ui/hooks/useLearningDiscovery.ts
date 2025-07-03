/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  LearningDiscoveryState,
  LearningDiscoveryUIState,
  LearningQuestion,
  LearningPhase,
  QuestionType,
  QuestionGenerationParams,
  PathGenerationParams,
  LearningPath,
  QuestionFeedback,
  FeedbackType,
} from '../types/learning.js';
import { QuestionGeneratorTool } from '@google/gemini-cli-core';

export interface UseLearningDiscoveryProps {
  /** Gemini APIクライアント */
  geminiClient?: any; // TODO: 適切な型定義に置き換え
}

export interface UseLearningDiscoveryReturn {
  /** 現在の学習発見状態 */
  state: LearningDiscoveryState | null;
  /** UI状態 */
  uiState: LearningDiscoveryUIState;
  /** 新しい学習セッションを開始 */
  startLearningSession: () => void;
  /** セッションを終了 */
  endLearningSession: () => void;
  /** 質問に回答 */
  answerQuestion: (answer: string, selectedOptionIndex?: number, customInput?: string) => Promise<void>;
  /** 次の質問を生成 */
  generateNextQuestion: () => Promise<void>;
  /** フィードバックを表示 */
  showFeedback: (feedback: QuestionFeedback) => void;
  /** ラーニングパスを生成 */
  generateLearningPath: () => Promise<void>;
  /** エラーをクリア */
  clearError: () => void;
  /** 現在の質問 */
  currentQuestion: LearningQuestion | null;
}

/**
 * 学習発見セッションを管理するカスタムフック
 * 
 * Phase 2の拡張実装：
 * - AI統合による動的質問生成
 * - 理解度評価問題の出題
 * - 即時フィードバック機能
 * - 基本的な状態管理
 * - 質問と回答の履歴管理
 * - UI状態の管理
 */
export function useLearningDiscovery(props?: UseLearningDiscoveryProps): UseLearningDiscoveryReturn {
  // メイン状態
  const [state, setState] = useState<LearningDiscoveryState | null>(null);
  
  // UI状態
  const [uiState, setUiState] = useState<LearningDiscoveryUIState>({
    isDialogOpen: false,
    isLoading: false,
    isGeneratingQuestion: false,
    isShowingFeedback: false,
    isGeneratingPath: false,
  });

  // 参照用
  const stateRef = useRef<LearningDiscoveryState | null>(null);
  stateRef.current = state;

  // 質問生成ツール
  const questionGeneratorTool = useRef(new QuestionGeneratorTool());

  // AI統合用の質問生成
  const generateQuestionWithAI = useCallback(async (params: any): Promise<LearningQuestion> => {
    try {
      // Phase 2: 実際のAI統合
      // 現在はフォールバック実装を使用
      const result = await questionGeneratorTool.current.getQuestionData(params);
      
      const newQuestion: LearningQuestion = {
        id: uuidv4(),
        type: result.type as QuestionType,
        question: result.question,
        suggestedOptions: result.suggestedOptions,
        correctAnswer: result.correctAnswer,
      };

      return newQuestion;
    } catch (error) {
      console.error('Failed to generate question with AI:', error);
      // フォールバック: 基本的な質問を生成
      return generateFallbackQuestion(params);
    }
  }, []);

  // フォールバック質問生成
  const generateFallbackQuestion = useCallback((params: any): LearningQuestion => {
    if (params.phase === 'discovery') {
      const basicQuestions = [
        '学習する主な目的は何ですか？',
        '現在の知識レベルはどの程度ですか？',
        'どのくらいの期間で習得したいですか？',
        'どのような学習方法を好みますか？'
      ];
      
      const basicOptions = [
        ['仕事・キャリアアップのため', '個人的な興味として', '学校の課題のため', '他分野の理解のため'],
        ['全くの初心者', '少し知識がある', 'ある程度理解している', '結構詳しい'],
        ['1-2週間程度', '1-3ヶ月程度', '半年から1年', '特に期限なし'],
        ['理論から段階的に', '実践例から学ぶ', '問題解決型', '視覚的資料活用']
      ];

      const questionIndex = Math.min(params.previousQuestions.length, basicQuestions.length - 1);
      
      return {
        id: uuidv4(),
        type: 'discovery',
        question: basicQuestions[questionIndex],
        suggestedOptions: basicOptions[questionIndex],
      };
    } else {
      // assessment フェーズのフォールバック
      return {
        id: uuidv4(),
        type: 'assessment',
        question: `${params.subject}について基本的な理解度を確認します。重要だと思う要素はどれですか？`,
        suggestedOptions: [
          '基礎概念の正確な理解',
          '実践的な応用能力',
          '関連分野との関係性',
          '最新動向の把握'
        ],
        correctAnswer: '基礎概念の正確な理解',
      };
    }
  }, []);

  /**
   * 新しい学習セッションを開始
   */
  const startLearningSession = useCallback(() => {
    const newSessionId = uuidv4();
    const newState: LearningDiscoveryState = {
      phase: 'discovery',
      subject: '',
      questions: [],
      currentQuestionIndex: -1,
      startedAt: new Date(),
      sessionId: newSessionId,
      isInformationSufficient: false,
    };

    setState(newState);
    setUiState(prev => ({
      ...prev,
      error: undefined,
    }));

    // 最初の質問を生成
    setTimeout(() => {
      generateFirstQuestion();
    }, 100);
  }, []);

  /**
   * セッションを終了
   */
  const endLearningSession = useCallback(() => {
    setState(null);
    setUiState({
      isDialogOpen: false,
      isLoading: false,
      isGeneratingQuestion: false,
      isShowingFeedback: false,
      isGeneratingPath: false,
    });
  }, []);

  /**
   * 最初の質問を生成（Phase 2: AI統合対応）
   */
  const generateFirstQuestion = useCallback(async () => {
    if (!stateRef.current) return;

    setUiState(prev => ({ ...prev, isGeneratingQuestion: true }));

    try {
      // 最初の質問は分野選択（固定）
      const firstQuestion: LearningQuestion = {
        id: uuidv4(),
        type: 'discovery',
        question: 'どのような分野について学びたいですか？',
        suggestedOptions: [
          '数学・統計学（線形代数、微積分、統計など）',
          'プログラミング・コンピューターサイエンス',
          '歴史・社会科学（日本史、世界史、政治など）',
          '自然科学（物理、化学、生物など）',
        ],
      };

      setState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          questions: [firstQuestion],
          currentQuestionIndex: 0,
        };
      });
    } catch (error) {
      setUiState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to generate first question',
      }));
    } finally {
      setUiState(prev => ({
        ...prev,
        isGeneratingQuestion: false,
      }));
    }
  }, []);

  /**
   * 質問に回答
   */
  const answerQuestion = useCallback(async (
    answer: string,
    selectedOptionIndex?: number,
    customInput?: string
  ) => {
    if (!stateRef.current || stateRef.current.currentQuestionIndex === -1) return;

    const currentQuestionIndex = stateRef.current.currentQuestionIndex;
    const currentQuestion = stateRef.current.questions[currentQuestionIndex];

    if (!currentQuestion) return;

    // 回答を記録
    const updatedQuestion: LearningQuestion = {
      ...currentQuestion,
      userResponse: answer,
      selectedOptionIndex,
      customInput,
      answeredAt: new Date(),
    };

    setState(prev => {
      if (!prev) return prev;
      const updatedQuestions = [...prev.questions];
      updatedQuestions[currentQuestionIndex] = updatedQuestion;
      
      return {
        ...prev,
        questions: updatedQuestions,
        subject: currentQuestionIndex === 0 ? answer : prev.subject, // 最初の質問は学習分野
      };
    });

    // Phase 2: 即時フィードバック実装
    if (currentQuestion.type === 'assessment') {
      // 評価問題の場合は即座にフィードバックを生成・表示
      const feedback = generateImmediateFeedback(currentQuestion, answer);
      if (feedback) {
        // 質問にフィードバックを追加
        updatedQuestion.feedback = feedback;
        
        // フィードバックを表示
        setTimeout(() => {
          showFeedback(feedback);
        }, 100);
      }
    }

    // 次の質問を生成
    await generateNextQuestion();
  }, []);

  /**
   * 即時フィードバック生成
   */
  const generateImmediateFeedback = useCallback((question: LearningQuestion, userAnswer: string): QuestionFeedback | null => {
    if (question.type !== 'assessment' || !question.correctAnswer) {
      return null;
    }

    const isCorrect = userAnswer.trim() === question.correctAnswer.trim();
    
    return {
      type: isCorrect ? 'correct' : 'incorrect',
      message: isCorrect 
        ? '正解です！よく理解されています。' 
        : `不正解です。正解は「${question.correctAnswer}」です。`,
      explanation: question.feedback?.explanation || 
        (isCorrect 
          ? 'この概念をしっかりと理解されています。' 
          : 'この概念について、もう少し詳しく学習してみましょう。'),
      relatedConcepts: isCorrect ? [] : ['基礎概念の復習', '関連する学習リソース'],
    };
  }, []);

  /**
   * 次の質問を生成 (Phase 2: AI統合対応)
   */
  const generateNextQuestion = useCallback(async () => {
    if (!stateRef.current) return;

    setUiState(prev => ({ ...prev, isGeneratingQuestion: true }));

    try {
      const currentState = stateRef.current;
      const currentIndex = currentState.currentQuestionIndex;
      
      // 履歴を質問生成用の形式に変換
      const previousQuestions = currentState.questions
        .filter(q => q.userResponse) // 回答済みの質問のみ
        .map(q => ({
          question: q.question,
          answer: q.userResponse!,
          type: q.type as 'discovery' | 'assessment' | 'open-ended',
        }));

      // AI統合による質問生成
      const params = {
        phase: currentState.phase as 'discovery' | 'assessment',
        subject: currentState.subject,
        previousQuestions,
        questionType: currentState.phase === 'discovery' ? 'discovery' : 'assessment',
        currentLevel: 'beginner' as const, // TODO: 動的に判定
      };

      const nextQuestion = await generateQuestionWithAI(params);

      // AIが十分な情報が集まったと判断した場合
      if (params.phase === 'discovery' && previousQuestions.length >= 3) {
        // 理解度評価フェーズに移行するかチェック
        const shouldMoveToAssessment = await checkShouldMoveToAssessment(currentState);
        
        if (shouldMoveToAssessment) {
          setState(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              phase: 'assessment',
            };
          });
          
          // 最初の理解度評価問題を生成
          const assessmentParams = {
            ...params,
            phase: 'assessment' as const,
            questionType: 'assessment' as const,
          };
          
          const assessmentQuestion = await generateQuestionWithAI(assessmentParams);
          
          setState(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              questions: [...prev.questions, assessmentQuestion],
              currentQuestionIndex: prev.questions.length,
            };
          });
          
          return;
        }
      }

      // 理解度評価フェーズで十分な評価が完了した場合
      if (params.phase === 'assessment' && previousQuestions.filter(q => q.type === 'assessment').length >= 2) {
        setState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            isInformationSufficient: true,
            phase: 'path-generation',
          };
        });

        // ラーニングパス生成に進む
        await generateLearningPath();
        return;
      }

      // 通常の次の質問を追加
      setState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          questions: [...prev.questions, nextQuestion],
          currentQuestionIndex: prev.questions.length,
        };
      });

    } catch (error) {
      setUiState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to generate next question',
      }));
    } finally {
      setUiState(prev => ({ ...prev, isGeneratingQuestion: false }));
    }
  }, [generateQuestionWithAI]);

  /**
   * 理解度評価フェーズに移行するかチェック
   */
  const checkShouldMoveToAssessment = useCallback(async (currentState: LearningDiscoveryState): Promise<boolean> => {
    // Phase 2: シンプルな判定ロジック
    // 3つ以上の発見質問に回答していれば評価フェーズに移行
    const discoveryAnswers = currentState.questions.filter(q => q.type === 'discovery' && q.userResponse);
    return discoveryAnswers.length >= 3;
  }, []);

  /**
   * フィードバックを表示
   */
  const showFeedback = useCallback((feedback: QuestionFeedback) => {
    setUiState(prev => ({ ...prev, isShowingFeedback: true }));
    
    // フィードバックを一定時間表示
    setTimeout(() => {
      setUiState(prev => ({ ...prev, isShowingFeedback: false }));
    }, 3000); // 3秒間表示
  }, []);

  /**
   * ラーニングパスを生成
   */
  const generateLearningPath = useCallback(async () => {
    if (!stateRef.current) return;

    setUiState(prev => ({ ...prev, isGeneratingPath: true }));

    try {
      // Phase 1では基本的なラーニングパスを生成
      const path: LearningPath = {
        id: uuidv4(),
        subject: stateRef.current.subject,
        goal: `${stateRef.current.subject}の習得`,
        estimatedDuration: '3ヶ月',
        prerequisites: ['基本的な読み書き能力'],
        milestones: [
          {
            id: uuidv4(),
            title: '基礎概念の理解',
            description: `${stateRef.current.subject}の基本的な概念と用語を理解する`,
            estimatedTime: '2-3週間',
            concepts: ['基本用語', '基礎概念', '全体像'],
            practiceExercises: ['用語の確認', '基本問題'],
            completionCriteria: ['用語を説明できる', '基本概念を理解している'],
            order: 0,
          },
          {
            id: uuidv4(),
            title: '実践的な理解',
            description: '実際の問題を解きながら理解を深める',
            estimatedTime: '4-6週間',
            concepts: ['応用概念', '問題解決手法'],
            practiceExercises: ['実践問題', 'ケーススタディ'],
            completionCriteria: ['問題を自力で解ける', '応用ができる'],
            order: 1,
          },
          {
            id: uuidv4(),
            title: '高度な応用',
            description: '高度な概念と実世界での応用を学ぶ',
            estimatedTime: '4-6週間',
            concepts: ['高度な概念', '実世界での応用'],
            practiceExercises: ['プロジェクト', '総合問題'],
            completionCriteria: ['独立して応用できる', '他者に教えられる'],
            order: 2,
          },
        ],
        createdAt: new Date(),
        currentLevel: 'beginner', // Phase 1では初心者レベルと仮定
        recommendedPace: 'normal',
      };

      setState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          generatedPath: path,
          phase: 'completed',
        };
      });
    } catch (error) {
      setUiState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to generate learning path',
      }));
    } finally {
      setUiState(prev => ({ ...prev, isGeneratingPath: false }));
    }
  }, []);

  /**
   * エラーをクリア
   */
  const clearError = useCallback(() => {
    setUiState(prev => ({ ...prev, error: undefined }));
  }, []);

  // 現在の質問を取得
  const currentQuestion = state && state.currentQuestionIndex >= 0 
    ? state.questions[state.currentQuestionIndex] 
    : null;

  return {
    state,
    uiState,
    startLearningSession,
    endLearningSession,
    answerQuestion,
    generateNextQuestion,
    showFeedback,
    generateLearningPath,
    clearError,
    currentQuestion,
  };
}