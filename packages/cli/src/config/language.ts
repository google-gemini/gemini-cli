/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'node:os';
import process from 'node:process';
import { SupportedLanguage, SUPPORTED_LANGUAGES, isSupportedLanguage } from '../i18n/definitions.js';

// 延迟导入以避免循环依赖
let i18n: any;

function getI18n() {
  if (!i18n) {
    i18n = require('../i18n/index.js').i18n;
  }
  return i18n;
}

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
 * 从系统环境变量获取语言
 */
function getLanguageFromEnv(): SupportedLanguage | null {
  // 检查系统语言环境变量（不包括 GEMINI_CLI_LANGUAGE，因为它在更高优先级处理）
  const envLang = process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL;
  
  if (envLang) {
    // 提取语言代码（如 'zh_CN.UTF-8' -> 'zh'）
    const langCode = envLang.split('_')[0].split('.')[0].toLowerCase();
    
    if (isSupportedLanguage(langCode)) {
      return langCode as SupportedLanguage;
    }
  }
  
  return null;
}

/**
 * 获取有效的语言设置
 * 优先级：CLI参数 > GEMINI_CLI_LANGUAGE > 配置文件 > 系统环境变量 > 默认值
 */
export function getEffectiveLanguage(cliArg?: string): SupportedLanguage {
  // 1. CLI 参数优先级最高
  if (cliArg && isSupportedLanguage(cliArg)) {
    return cliArg as SupportedLanguage;
  }

  // 2. GEMINI_CLI_LANGUAGE environment variable
  const geminiCliLang = process.env.GEMINI_CLI_LANGUAGE;
  if (geminiCliLang && isSupportedLanguage(geminiCliLang)) {
    return geminiCliLang as SupportedLanguage;
  }
  
  // 3. 配置文件
  const savedConfig = loadLanguageConfig();
  if (savedConfig?.language) {
    return savedConfig.language;
  }
  
  // 4. 系统环境变量
  const envLang = getLanguageFromEnv();
  if (envLang) {
    return envLang;
  }
  
  // 5. 默认值
  return 'en';
}

/**
 * 设置并保存语言配置
 */
export function setLanguage(language: string): boolean {
  if (!isSupportedLanguage(language)) {
    console.error(`Unsupported language: ${language}. Supported languages: ${SUPPORTED_LANGUAGES.join(', ')}`);
    return false;
  }
  
  // 设置 i18n 语言
  getI18n().setLanguage(language);
  
  // 保存到配置文件
  saveLanguageConfig({ language: language as SupportedLanguage });
  
  return true;
}

/**
 * 初始化语言设置
 */
export function initializeLanguage(cliLanguage?: string): void {
  const effectiveLanguage = getEffectiveLanguage(cliLanguage);
  getI18n().setLanguage(effectiveLanguage);
  
  // 如果CLI参数指定了语言，保存到配置文件
  if (cliLanguage && isSupportedLanguage(cliLanguage)) {
    saveLanguageConfig({ language: cliLanguage as SupportedLanguage });
  }
}
