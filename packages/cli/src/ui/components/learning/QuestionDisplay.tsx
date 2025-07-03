/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';
import { LearningQuestion, QuestionType } from '../../types/learning.js';

export interface QuestionDisplayProps {
  /** 表示する質問 */
  question: LearningQuestion;
  /** 質問番号を表示するかどうか */
  showQuestionNumber?: boolean;
  /** 質問番号（1から始まる） */
  questionNumber?: number;
}

/**
 * 学習質問を表示するコンポーネント
 * Phase 1の基本実装
 */
export const QuestionDisplay: React.FC<QuestionDisplayProps> = ({
  question,
  showQuestionNumber = false,
  questionNumber,
}) => {
  const getQuestionIcon = (type: QuestionType): string => {
    switch (type) {
      case 'discovery':
        return '🔍';
      case 'assessment':
        return '📝';
      case 'open-ended':
        return '💭';
      default:
        return '❓';
    }
  };

  const getQuestionTypeLabel = (type: QuestionType): string => {
    switch (type) {
      case 'discovery':
        return '深堀り質問';
      case 'assessment':
        return '理解度確認';
      case 'open-ended':
        return '自由回答';
      default:
        return '質問';
    }
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* 質問タイプとアイコン */}
      <Box marginBottom={1}>
        <Text color={Colors.AccentCyan}>
          {getQuestionIcon(question.type)} {getQuestionTypeLabel(question.type)}
          {showQuestionNumber && questionNumber && (
            <Text dimColor> (質問 {questionNumber})</Text>
          )}
        </Text>
      </Box>

      {/* 質問内容 */}
      <Box
        borderStyle="single"
        borderColor={Colors.Gray}
        padding={1}
        marginBottom={1}
      >
        <Text wrap="wrap">
          {question.question}
        </Text>
      </Box>

      {/* フィードバック表示（回答済みの場合） */}
      {question.feedback && (
        <Box
          borderStyle="single"
          borderColor={getFeedbackColor(question.feedback.type)}
          padding={1}
          marginBottom={1}
        >
          <Text color={getFeedbackColor(question.feedback.type)}>
            {getFeedbackIcon(question.feedback.type)} {question.feedback.message}
          </Text>
          {question.feedback.explanation && (
            <Box marginTop={1}>
              <Text dimColor wrap="wrap">
                {question.feedback.explanation}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {/* 回答済みの場合は回答を表示 */}
      {question.userResponse && (
        <Box marginBottom={1}>
          <Text dimColor>
            あなたの回答: <Text color={Colors.AccentGreen}>{question.userResponse}</Text>
          </Text>
          {question.answeredAt && (
            <Text dimColor>
              {' '}(回答日時: {question.answeredAt.toLocaleTimeString()})
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
};

/**
 * フィードバックタイプに応じた色を取得
 */
function getFeedbackColor(type: string): string {
  switch (type) {
    case 'correct':
      return Colors.AccentGreen;
    case 'incorrect':
      return Colors.AccentRed;
    case 'partial':
      return Colors.AccentYellow;
    case 'neutral':
    default:
      return Colors.AccentBlue;
  }
}

/**
 * フィードバックタイプに応じたアイコンを取得
 */
function getFeedbackIcon(type: string): string {
  switch (type) {
    case 'correct':
      return '✅';
    case 'incorrect':
      return '❌';
    case 'partial':
      return '⚠️';
    case 'neutral':
    default:
      return 'ℹ️';
  }
}