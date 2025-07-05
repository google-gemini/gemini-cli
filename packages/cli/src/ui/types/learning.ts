/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Learning types for Sensei-AI UI components
 */

export type QuestionType = 
  | 'discovery'           // 深堀り質問（選択肢あり）
  | 'assessment'          // 理解度評価問題（正誤あり）
  | 'open-ended'          // 自由回答
  | 'self-assessment'     // 理解度自己評価（はい・まあまあ・あまり・すこし）
  | 'text-comprehension'  // 文章理解問題
  | 'scenario-based';     // シナリオベース問題

export type FeedbackType = 
  | 'correct'        // 正解
  | 'incorrect'      // 不正解
  | 'partial'        // 部分的に正解
  | 'neutral';       // 中性的（発見質問など）

/**
 * 個別の質問データ
 */
export interface LearningQuestion {
  /** 質問ID */
  id: string;
  /** 質問タイプ */
  type: QuestionType;
  /** 質問文 */
  question: string;
  /** コンテキスト文章（文章理解問題の場合） */
  context?: string;
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
}

/**
 * 質問に対するフィードバック
 */
export interface QuestionFeedback {
  /** フィードバックの種類 */
  type: FeedbackType;
  /** フィードバックメッセージ */
  message: string;
  /** 詳細な解説（オプション） */
  explanation?: string;
  /** 関連概念のリスト */
  relatedConcepts?: string[];
}

/**
 * 選択肢アイテム（OptionSelector用）
 */
export interface LearningOptionItem {
  /** 選択肢のラベル */
  label: string;
  /** 選択肢の値 */
  value: string;
  /** 無効化フラグ */
  disabled?: boolean;
}