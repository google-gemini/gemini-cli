/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';
import { LearningPath, LearningMilestone } from '../../types/learning.js';

export interface LearningPathDisplayProps {
  /** 表示するラーニングパス */
  path: LearningPath;
  /** 学習開始時のコールバック */
  onStartLearning: () => void;
  /** パス編集時のコールバック */
  onEditPath: () => void;
}

/**
 * 生成されたラーニングパスを表示するコンポーネント
 * Phase 1の基本実装
 */
export const LearningPathDisplay: React.FC<LearningPathDisplayProps> = ({
  path,
  onStartLearning,
  onEditPath,
}) => {
  return (
    <Box flexDirection="column">
      {/* ヘッダー */}
      <Box marginBottom={1}>
        <Text bold color={Colors.AccentGreen}>
          🎯 あなた専用のラーニングパスが完成しました！
        </Text>
      </Box>

      {/* パス概要 */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={Colors.AccentGreen}
        padding={1}
        marginBottom={1}
      >
        <Box marginBottom={1}>
          <Text bold color={Colors.AccentBlue}>
            📚 学習分野: <Text color={Colors.Foreground}>{path.subject}</Text>
          </Text>
        </Box>
        
        <Box marginBottom={1}>
          <Text bold color={Colors.AccentBlue}>
            🎯 目標: <Text color={Colors.Foreground}>{path.goal}</Text>
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text bold color={Colors.AccentBlue}>
            ⏱️ 推定期間: <Text color={Colors.AccentYellow}>{path.estimatedDuration}</Text>
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text bold color={Colors.AccentBlue}>
            📊 現在のレベル: <Text color={Colors.AccentCyan}>{getLevelDisplayName(path.currentLevel)}</Text>
          </Text>
        </Box>

        <Box>
          <Text bold color={Colors.AccentBlue}>
            🏃‍♂️ 推奨ペース: <Text color={Colors.AccentCyan}>{getPaceDisplayName(path.recommendedPace)}</Text>
          </Text>
        </Box>
      </Box>

      {/* 前提知識 */}
      {path.prerequisites.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={Colors.AccentCyan}>
            📋 前提知識:
          </Text>
          {path.prerequisites.map((prerequisite, index) => (
            <Box key={index} marginLeft={2}>
              <Text>• {prerequisite}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* マイルストーン */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={Colors.AccentCyan}>
          🗺️ 学習マイルストーン:
        </Text>
        
        {path.milestones
          .sort((a, b) => a.order - b.order)
          .map((milestone, index) => (
            <MilestoneDisplay
              key={milestone.id}
              milestone={milestone}
              isLast={index === path.milestones.length - 1}
            />
          ))}
      </Box>

      {/* アクション */}
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor={Colors.AccentGreen}
        padding={1}
      >
        <Text bold color={Colors.AccentGreen}>
          次のステップ:
        </Text>
        
        <Box marginTop={1} marginBottom={1}>
          <Text>
            🚀 <Text bold>学習を開始</Text> - すぐに学習を開始します
          </Text>
        </Box>
        
        <Box marginBottom={1}>
          <Text>
            ✏️ <Text bold>パスを編集</Text> - 内容を調整できます（今後実装予定）
          </Text>
        </Box>
        
        <Box>
          <Text dimColor>
            💡 このパスは自動保存されるので、いつでも戻ってこれます
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

/**
 * 個別のマイルストーンを表示するコンポーネント
 */
const MilestoneDisplay: React.FC<{
  milestone: LearningMilestone;
  isLast: boolean;
}> = ({ milestone, isLast }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      {/* マイルストーンタイトル */}
      <Box>
        <Text color={Colors.AccentYellow}>
          {milestone.order + 1}. {milestone.title}
        </Text>
        <Text dimColor> ({milestone.estimatedTime})</Text>
      </Box>

      {/* 説明 */}
      <Box marginLeft={4} marginTop={1}>
        <Text wrap="wrap">
          {milestone.description}
        </Text>
      </Box>

      {/* 習得概念 */}
      {milestone.concepts.length > 0 && (
        <Box flexDirection="column" marginLeft={4} marginTop={1}>
          <Text dimColor>習得概念:</Text>
          {milestone.concepts.slice(0, 3).map((concept, index) => (
            <Box key={index} marginLeft={2}>
              <Text dimColor>• {concept}</Text>
            </Box>
          ))}
          {milestone.concepts.length > 3 && (
            <Box marginLeft={2}>
              <Text dimColor>... その他 {milestone.concepts.length - 3} 項目</Text>
            </Box>
          )}
        </Box>
      )}

      {/* 区切り線（最後以外） */}
      {!isLast && (
        <Box marginTop={1} marginLeft={2}>
          <Text dimColor>│</Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * レベル表示名を取得
 */
function getLevelDisplayName(level: string): string {
  switch (level) {
    case 'beginner':
      return '初心者';
    case 'intermediate':
      return '中級者';
    case 'advanced':
      return '上級者';
    default:
      return level;
  }
}

/**
 * ペース表示名を取得
 */
function getPaceDisplayName(pace: string): string {
  switch (pace) {
    case 'slow':
      return 'ゆっくり';
    case 'normal':
      return '標準';
    case 'fast':
      return '速い';
    default:
      return pace;
  }
}