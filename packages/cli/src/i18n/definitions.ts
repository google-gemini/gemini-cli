/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 支持的语言类型
 */
export type SupportedLanguage = 'en' | 'zh' | 'ja';

/**
 * 所有支持的语言列表
 */
export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ['en', 'zh', 'ja'] as const;

/**
 * 检查给定的语言代码是否受支持
 * @param lang 要检查的语言代码
 * @returns 如果支持则返回true
 */
export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
}
