/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'node:os';
import process from 'node:process';
import { i18n, SupportedLanguage, SUPPORTED_LANGUAGES } from '../i18n/index.js';

export interface LanguageConfig {
  language: SupportedLanguage;
}

const CONFIG_DIR = path.join(homedir(), '.gemini-cli');
const LANGUAGE_CONFIG_FILE = path.join(CONFIG_DIR, 'language.json');

/**
 * 确保配置目录存在
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * 加载语言配置
 */
export function loadLanguageConfig(): LanguageConfig | null {
  try {
    if (fs.existsSync(LANGUAGE_CONFIG_FILE)) {
      const content = fs.readFileSync(LANGUAGE_CONFIG_FILE, 'utf-8');
      const config = JSON.parse(content) as LanguageConfig;
      
      // 验证配置中的语言是否支持
      if (i18n.isSupportedLanguage(config.language)) {
        return config;
      }
    }
  } catch (error) {
    console.warn('Failed to load language config, using default');
  }
  
  return null;
}

/**
 * 保存语言配置
 */
export function saveLanguageConfig(config: LanguageConfig): void {
  try {
    ensureConfigDir();
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(LANGUAGE_CONFIG_FILE, content, 'utf-8');
  } catch (error) {
    console.warn('Failed to save language config:', error);
  }
}

/**
 * 从环境变量获取语言
 */
function getLanguageFromEnv(): SupportedLanguage | null {
  // 首先检查专用的 GEMINI_CLI_LANGUAGE 环境变量
  const geminiLang = process.env.GEMINI_CLI_LANGUAGE;
  if (geminiLang && i18n.isSupportedLanguage(geminiLang)) {
    return geminiLang;
  }
  
  // 检查常见的语言环境变量
  const envLang = process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL;
  
  if (envLang) {
    // 提取语言代码（如 'zh_CN.UTF-8' -> 'zh'）
    const langCode = envLang.split('_')[0].split('.')[0].toLowerCase();
    
    if (i18n.isSupportedLanguage(langCode)) {
      return langCode;
    }
  }
  
  return null;
}

/**
 * 获取有效的语言设置
 * 优先级：CLI参数 > 配置文件 > 环境变量 > 默认值
 */
export function getEffectiveLanguage(cliArg?: string): SupportedLanguage {
  // 1. CLI 参数优先级最高
  if (cliArg && i18n.isSupportedLanguage(cliArg)) {
    return cliArg;
  }
  
  // 2. 配置文件
  const savedConfig = loadLanguageConfig();
  if (savedConfig && savedConfig.language) {
    return savedConfig.language;
  }
  
  // 3. 环境变量
  const envLang = getLanguageFromEnv();
  if (envLang) {
    return envLang;
  }
  
  // 4. 默认值
  return 'en';
}

/**
 * 设置并保存语言配置
 */
export function setLanguage(language: string): boolean {
  if (!i18n.isSupportedLanguage(language)) {
    console.error(`Unsupported language: ${language}. Supported languages: ${SUPPORTED_LANGUAGES.join(', ')}`);
    return false;
  }
  
  // 设置 i18n 语言
  i18n.setLanguage(language);
  
  // 保存到配置文件
  saveLanguageConfig({ language });
  
  return true;
}

/**
 * 初始化语言设置
 */
export function initializeLanguage(cliLanguage?: string): void {
  const effectiveLanguage = getEffectiveLanguage(cliLanguage);
  i18n.setLanguage(effectiveLanguage);
  
  // 如果CLI参数指定了语言，保存到配置文件
  if (cliLanguage && i18n.isSupportedLanguage(cliLanguage)) {
    saveLanguageConfig({ language: cliLanguage });
  }
}
