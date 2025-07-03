/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Learning discovery phase types for Sensei-AI
 */

export type LearningPhase = 
  | 'discovery'      // 深堀りフェーズ - ユーザーの興味と目標を探る
  | 'assessment'     // 理解度評価フェーズ - 問題出題で現在の知識レベルを把握
  | 'path-generation' // ラーニングパス生成フェーズ
  | 'completed';     // 完了

export type QuestionType = 
  | 'discovery'      // 深堀り質問（選択肢あり）
  | 'assessment'     // 理解度評価問題（正誤あり）
  | 'open-ended';    // 自由回答

export type FeedbackType = 
  | 'correct'        // 正解
  | 'incorrect'      // 不正解
  | 'partial'        // 部分的に正解
  | 'neutral';       // 中性的（発見質問など）

/**
 * 学習発見セッションの全体状態
 */
export interface LearningDiscoveryState {
  /** 現在のフェーズ */
  phase: LearningPhase;
  /** 学習対象分野 */
  subject: string;
  /** 学習目標（ユーザーが設定） */
  goal?: string;
  /** 質問履歴 */
  questions: LearningQuestion[];
  /** 現在の質問のインデックス */
  currentQuestionIndex: number;
  /** 生成されたラーニングパス */
  generatedPath?: LearningPath;
  /** セッション開始時刻 */
  startedAt: Date;
  /** セッションID */
  sessionId: string;
  /** AI判定による十分性フラグ */
  isInformationSufficient: boolean;
}

/**
 * 個別の質問とその回答
 */
export interface LearningQuestion {
  /** 質問ID */
  id: string;
  /** 質問タイプ */
  type: QuestionType;
  /** 質問文 */
  question: string;
  /** 提案選択肢（最大4つ） */
  suggestedOptions: string[];
  /** ユーザーの回答 */
  userResponse?: string;
  /** 選択した選択肢のインデックス（-1はカスタム入力） */
  selectedOptionIndex?: number;
  /** カスタム入力内容 */
  customInput?: string;
  /** 回答時刻 */
  answeredAt?: Date;
  /** 正解（評価問題の場合） */
  correctAnswer?: string;
  /** フィードバック */
  feedback?: QuestionFeedback;
  /** AI生成の次質問へのヒント */
  nextQuestionHint?: string;
}

/**
 * 問題への即時フィードバック
 */
export interface QuestionFeedback {
  /** フィードバックタイプ */
  type: FeedbackType;
  /** フィードバックメッセージ */
  message: string;
  /** 解説（不正解時の詳細説明） */
  explanation?: string;
  /** 関連する概念への参照 */
  relatedConcepts?: string[];
  /** 追加学習リソースの提案 */
  additionalResources?: string[];
}

/**
 * 生成されたラーニングパス
 */
export interface LearningPath {
  /** パスID */
  id: string;
  /** 学習分野 */
  subject: string;
  /** 学習目標 */
  goal: string;
  /** 推定学習期間 */
  estimatedDuration: string;
  /** 前提知識 */
  prerequisites: string[];
  /** 学習マイルストーン */
  milestones: LearningMilestone[];
  /** 生成時刻 */
  createdAt: Date;
  /** ユーザーの現在の理解レベル */
  currentLevel: 'beginner' | 'intermediate' | 'advanced';
  /** 推奨学習ペース */
  recommendedPace: 'slow' | 'normal' | 'fast';
}

/**
 * 学習マイルストーン
 */
export interface LearningMilestone {
  /** マイルストーンID */
  id: string;
  /** タイトル */
  title: string;
  /** 説明 */
  description: string;
  /** 推定所要時間 */
  estimatedTime: string;
  /** 習得すべき概念 */
  concepts: string[];
  /** 実践課題 */
  practiceExercises: string[];
  /** 完了条件 */
  completionCriteria: string[];
  /** 順序（0から始まる） */
  order: number;
}

/**
 * UI状態管理用のインターface
 */
export interface LearningDiscoveryUIState {
  /** ダイアログの表示状態 */
  isDialogOpen: boolean;
  /** ローディング状態 */
  isLoading: boolean;
  /** エラーメッセージ */
  error?: string;
  /** 質問生成中フラグ */
  isGeneratingQuestion: boolean;
  /** フィードバック表示中フラグ */
  isShowingFeedback: boolean;
  /** パス生成中フラグ */
  isGeneratingPath: boolean;
}

/**
 * 質問生成のためのパラメータ
 */
export interface QuestionGenerationParams {
  /** 現在のフェーズ */
  phase: LearningPhase;
  /** 学習分野 */
  subject: string;
  /** これまでの質問と回答の履歴 */
  previousQuestions: LearningQuestion[];
  /** 質問タイプ */
  questionType: QuestionType;
  /** ユーザーの現在の理解レベル */
  currentLevel?: 'beginner' | 'intermediate' | 'advanced';
}

/**
 * ラーニングパス生成のためのパラメータ
 */
export interface PathGenerationParams {
  /** 学習分野 */
  subject: string;
  /** 学習目標 */
  goal: string;
  /** 発見フェーズで収集した情報 */
  discoveryResponses: LearningQuestion[];
  /** 評価フェーズの結果 */
  assessmentResults: LearningQuestion[];
  /** ユーザーの現在の理解レベル */
  currentLevel: 'beginner' | 'intermediate' | 'advanced';
}

/**
 * コンポーネント間で共有される選択肢アイテム
 */
export interface LearningOptionItem {
  /** 選択肢のラベル */
  label: string;
  /** 選択肢の値 */
  value: string;
  /** 無効化フラグ */
  disabled?: boolean;
}

/**
 * カスタム入力の設定
 */
export interface CustomInputConfig {
  /** カスタム入力を許可するか */
  allowCustomInput: boolean;
  /** カスタム入力のプレースホルダー */
  placeholder?: string;
  /** カスタム入力の最大文字数 */
  maxLength?: number;
}