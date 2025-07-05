/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { useInput } from 'ink';
import { Colors } from '../../colors.js';
import { RadioButtonSelect } from '../shared/RadioButtonSelect.js';
import { LearningOptionItem } from '../../types/learning.js';

export interface OptionSelectorProps {
  /** 選択肢のリスト */
  options: string[];
  /** 選択時のコールバック */
  onSelect: (answer: string, optionIndex?: number) => void;
  /** カスタム入力を許可するかどうか */
  allowCustomInput?: boolean;
  /** カスタム入力のプレースホルダー */
  customInputPlaceholder?: string;
  /** 無効化フラグ */
  disabled?: boolean;
  /** フォーカス状態 */
  isFocused?: boolean;
}

type SelectionMode = 'options' | 'custom-input';

/**
 * 学習質問の選択肢を表示し、選択できるコンポーネント
 * Phase 1の基本実装
 */
export const OptionSelector: React.FC<OptionSelectorProps> = ({
  options,
  onSelect,
  allowCustomInput = false,
  customInputPlaceholder = 'カスタム入力',
  disabled = false,
  isFocused = true,
}) => {
  const [mode, setMode] = useState<SelectionMode>('options');
  const [customInput, setCustomInput] = useState('');
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number>(0);

  // 選択肢を RadioButtonSelect 用の形式に変換
  const radioOptions: LearningOptionItem[] = [
    ...options.map((option, index) => ({
      label: option,
      value: index.toString(),
      disabled,
    })),
    ...(allowCustomInput
      ? [
          {
            label: `✏️ ${customInputPlaceholder}`,
            value: 'custom',
            disabled,
          },
        ]
      : []),
  ];

  // 選択肢選択時の処理
  const handleOptionSelect = useCallback((value: string) => {
    console.log('[DEBUG] OptionSelector.handleOptionSelect called:', { value, disabled });
    if (disabled) return;

    if (value === 'custom') {
      setMode('custom-input');
      return;
    }

    const index = parseInt(value, 10);
    setSelectedOptionIndex(index);
    console.log('[DEBUG] OptionSelector calling onSelect:', { answer: options[index], index });
    onSelect(options[index], index);
  }, [options, onSelect, disabled]);

  // カスタム入力モードでのキー入力処理
  useInput((input, key) => {
    if (mode !== 'custom-input' || disabled) return;

    if (key.return && customInput.trim()) {
      // Enterキーで送信
      onSelect(customInput.trim(), -1);
      setCustomInput('');
      setMode('options');
    } else if (key.escape) {
      // Escapeキーで選択肢モードに戻る
      setCustomInput('');
      setMode('options');
    } else if (key.backspace) {
      // バックスペースで文字削除
      setCustomInput(prev => prev.slice(0, -1));
    } else if (input && !key.ctrl && !key.meta) {
      // 通常の文字入力
      setCustomInput(prev => prev + input);
    }
  });

  if (mode === 'custom-input') {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text color={Colors.AccentCyan}>
            ✏️ カスタム入力モード
          </Text>
        </Box>
        
        <Box
          borderStyle="single"
          borderColor={Colors.AccentBlue}
          padding={1}
          marginBottom={1}
        >
          <Text>
            {customInput}
            <Text color={Colors.AccentBlue}>▋</Text>
          </Text>
        </Box>

        <Box flexDirection="column">
          <Text dimColor>
            💡 入力を完了したら Enter キーを押してください
          </Text>
          <Text dimColor>
            🔙 選択肢に戻るには Escape キーを押してください
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={Colors.AccentCyan}>
          選択肢から選んでください:
        </Text>
      </Box>

      <RadioButtonSelect
        items={radioOptions}
        onSelect={handleOptionSelect}
        isFocused={isFocused && !disabled}
        initialIndex={0}
      />

      <Box marginTop={1}>
        <Text dimColor>
          ↑↓ 矢印キーで選択、Enter で決定
          {allowCustomInput && ' • カスタム入力も選択可能'}
        </Text>
      </Box>
    </Box>
  );
};