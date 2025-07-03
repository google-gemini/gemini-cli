/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';
import { useLearningDiscovery } from '../../hooks/useLearningDiscovery.js';
import { QuestionDisplay } from './QuestionDisplay.js';
import { OptionSelector } from './OptionSelector.js';
import { LoadingIndicator } from '../LoadingIndicator.js';
import { LearningPathDisplay } from './LearningPathDisplay.js';

export interface LearningDiscoveryDialogProps {
  /** ダイアログが開いているかどうか */
  isOpen: boolean;
  /** ダイアログを閉じるコールバック */
  onClose: () => void;
}

/**
 * 学習発見ダイアログのメインコンポーネント
 * Phase 1の基本実装
 */
export const LearningDiscoveryDialog: React.FC<LearningDiscoveryDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    state,
    uiState,
    startLearningSession,
    answerQuestion,
    endLearningSession,
    clearError,
    currentQuestion,
  } = useLearningDiscovery();

  // ダイアログが開かれた時に学習セッションを開始
  useEffect(() => {
    if (isOpen && !state) {
      startLearningSession();
    }
  }, [isOpen, state, startLearningSession]);

  // ダイアログが閉じている場合は何も表示しない
  if (!isOpen || !state) {
    return null;
  }

  const handleClose = () => {
    endLearningSession();
    onClose();
  };

  const handleAnswerSelection = async (answer: string, optionIndex?: number) => {
    await answerQuestion(answer, optionIndex);
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={Colors.AccentBlue}
      padding={1}
      minHeight={20}
      width="100%"
    >
      {/* ヘッダー */}
      <Box marginBottom={1}>
        <Text bold color={Colors.AccentBlue}>
          📚 Sensei-AI - 新しい学習を開始
        </Text>
      </Box>

      {/* エラー表示 */}
      {uiState.error && (
        <Box marginBottom={1} borderStyle="single" borderColor={Colors.AccentRed} padding={1}>
          <Text color={Colors.AccentRed}>❌ エラー: {uiState.error}</Text>
          <Text dimColor>
            何か問題が発生しました。もう一度お試しください。
          </Text>
        </Box>
      )}

      {/* フェーズ表示 */}
      <Box marginBottom={1}>
        <Text dimColor>
          フェーズ: <Text color={Colors.AccentGreen}>{getPhaseDisplayName(state.phase)}</Text>
          {state.questions.length > 0 && (
            <Text dimColor> ({state.currentQuestionIndex + 1}/{state.questions.length})</Text>
          )}
        </Text>
      </Box>

      {/* メインコンテンツ */}
      <Box flexDirection="column" flexGrow={1}>
        {state.phase === 'discovery' && currentQuestion && (
          <>
            <QuestionDisplay question={currentQuestion} />
            
            {!uiState.isGeneratingQuestion && (
              <OptionSelector
                options={currentQuestion.suggestedOptions}
                onSelect={handleAnswerSelection}
                allowCustomInput={true}
                customInputPlaceholder="その他（自由入力）"
              />
            )}
            
            {uiState.isGeneratingQuestion && (
              <Box marginTop={1}>
                <LoadingIndicator 
                  currentLoadingPhrase="次の質問を生成中..." 
                  elapsedTime={0}
                />
              </Box>
            )}
          </>
        )}

        {state.phase === 'path-generation' && (
          <Box marginTop={1}>
            <LoadingIndicator 
              currentLoadingPhrase="あなた専用の学習パスを生成中..." 
              elapsedTime={0}
            />
            <Box marginTop={1}>
              <Text dimColor>
                収集した情報を基に、最適な学習プランを作成しています。
              </Text>
            </Box>
          </Box>
        )}

        {state.phase === 'completed' && state.generatedPath && (
          <LearningPathDisplay
            path={state.generatedPath}
            onStartLearning={() => {
              // TODO: 実際の学習セッションを開始
              handleClose();
            }}
            onEditPath={() => {
              // TODO: パス編集機能（Phase 2で実装）
            }}
          />
        )}
      </Box>

      {/* フッター */}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>
          💡 ヒント: 正直に答えることで、より良い学習体験を提供できます
        </Text>
        <Text dimColor>
          ESC: 終了
        </Text>
      </Box>
    </Box>
  );
};

/**
 * フェーズ名を日本語表示に変換
 */
function getPhaseDisplayName(phase: string): string {
  switch (phase) {
    case 'discovery':
      return '深堀りフェーズ';
    case 'assessment':
      return '理解度評価フェーズ';
    case 'path-generation':
      return 'ラーニングパス生成フェーズ';
    case 'completed':
      return '完了';
    default:
      return phase;
  }
}