/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { I18nMessages, I18nTranslationKey } from './types.js';
import { SupportedLanguage, SUPPORTED_LANGUAGES, isSupportedLanguage } from './definitions.js';
import { enMessages } from './locales/en.js';
import { zhMessages } from './locales/zh.js';
import { jaMessages } from './locales/ja.js';

// 语言包注册表
const LANGUAGE_REGISTRY: Record<SupportedLanguage, I18nMessages> = {
  en: enMessages,
  zh: zhMessages,
  ja: jaMessages,
};

class I18n {
  private currentLanguage: SupportedLanguage = 'en';
  private messages: I18nMessages = enMessages;

  /**
   * 设置当前语言
   * @param language 语言代码
   */
  public setLanguage(language: string): void {
    if (this.isSupportedLanguage(language)) {
      this.currentLanguage = language;
      this.messages = LANGUAGE_REGISTRY[language];
    } else {
      console.warn(`Unsupported language: ${language}, falling back to English`);
      this.currentLanguage = 'en';
      this.messages = LANGUAGE_REGISTRY.en;
    }
  }

  /**
   * 获取当前语言
   */
  public getCurrentLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  /**
   * 检查是否支持指定语言
   */
  public isSupportedLanguage(language: string): language is SupportedLanguage {
    return isSupportedLanguage(language);
  }

  /**
   * 获取支持的语言列表
   */
  public getSupportedLanguages(): SupportedLanguage[] {
    return [...SUPPORTED_LANGUAGES];
  }

  /**
   * 翻译文本
   * @param keyPath 翻译键路径，如 'commands.help' 或 'options.model.description'
   * @param params 可选的参数对象，用于字符串插值
   */
  public t(keyPath: string, params?: Record<string, any>): string {
    try {
      const value = this.getNestedValue(this.messages, keyPath);
      
      if (typeof value !== 'string') {
        console.warn(`Translation key "${keyPath}" does not resolve to a string`);
        return keyPath; // 返回键名作为fallback
      }

      // 简单的字符串插值
      if (params) {
        return this.interpolate(value, params);
      }

      return value;
    } catch (error) {
      console.warn(`Translation key "${keyPath}" not found, falling back to key`);
      return keyPath;
    }
  }

  /**
   * 获取嵌套对象的值
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * 字符串插值
   */
  private interpolate(template: string, params: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return params[key] !== undefined ? String(params[key]) : match;
    });
  }
}

// 全局 i18n 实例
export const i18n = new I18n();

// 便捷的翻译函数
export const t = (keyPath: string, params?: Record<string, any>): string => {
  return i18n.t(keyPath, params);
};

// 导出类型和常量
export { SupportedLanguage, SUPPORTED_LANGUAGES, isSupportedLanguage } from './definitions.js';
export * from './types.js';
// 注意: 不要从 config/language.js 重新导出以避免循环依赖
// 如需 initializeLanguage，请直接从 '../config/language.js' 导入
