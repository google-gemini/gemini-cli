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
 * Phase 1の基本実装：
 * - 基本的な状態管理
 * - 質問と回答の履歴管理
 * - UI状態の管理
 */
export function useLearningDiscovery(): UseLearningDiscoveryReturn {
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
   * 最初の質問を生成（Phase 1では固定質問）
   */
  const generateFirstQuestion = useCallback(() => {
    if (!stateRef.current) return;

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

    setUiState(prev => ({
      ...prev,
      isGeneratingQuestion: false,
    }));
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

    // Phase 1では基本的なフィードバックのみ
    if (currentQuestion.type === 'assessment') {
      // 評価問題の場合は即時フィードバックを表示
      const feedback: QuestionFeedback = {
        type: 'neutral', // Phase 1では中性的なフィードバック
        message: 'ご回答ありがとうございます。',
        explanation: '詳細な評価は今後の実装で追加予定です。',
      };
      showFeedback(feedback);
    }

    // 次の質問を生成
    await generateNextQuestion();
  }, []);

  /**
   * 次の質問を生成
   */
  const generateNextQuestion = useCallback(async () => {
    if (!stateRef.current) return;

    setUiState(prev => ({ ...prev, isGeneratingQuestion: true }));

    try {
      // Phase 1では事前定義された質問パターンを使用
      const currentIndex = stateRef.current.currentQuestionIndex;
      const nextIndex = currentIndex + 1;

      // 基本的な質問パターン（Phase 1）
      const questionPatterns = [
        // 1番目: 学習分野（既に表示済み）
        {
          question: 'なぜその分野を学びたいと思ったのですか？',
          options: [
            '仕事・キャリアアップのため',
            '個人的な興味・趣味として',
            '学校の課題・受験のため',
            '他の分野の理解を深めるため',
          ],
        },
        {
          question: 'どのくらいの期間で習得したいですか？',
          options: [
            '1-2週間程度で基礎を理解したい',
            '1-3ヶ月で実用的なレベルに',
            '半年から1年かけてじっくりと',
            '特に期限は設けていない',
          ],
        },
        {
          question: 'その分野についての現在の知識レベルはどの程度ですか？',
          options: [
            '全くの初心者（基本的な用語も知らない）',
            '少し知識がある（本を読んだことがある程度）',
            'ある程度理解している（基礎は身についている）',
            '結構詳しい（応用的な内容も理解できる）',
          ],
        },
      ];

      // 質問パターンの範囲内かチェック
      if (nextIndex < questionPatterns.length) {
        const pattern = questionPatterns[nextIndex];
        const nextQuestion: LearningQuestion = {
          id: uuidv4(),
          type: 'discovery',
          question: pattern.question,
          suggestedOptions: pattern.options,
        };

        setState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            questions: [...prev.questions, nextQuestion],
            currentQuestionIndex: nextIndex,
          };
        });
      } else {
        // 十分な情報が集まったと判定
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
    } catch (error) {
      setUiState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        isGeneratingQuestion: false,
      }));
    } finally {
      setUiState(prev => ({ ...prev, isGeneratingQuestion: false }));
    }
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