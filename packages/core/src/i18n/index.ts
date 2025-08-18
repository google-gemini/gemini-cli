/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreI18nMessages, CoreI18nTranslationKey } from './types.js';
import { coreEnMessages } from './locales/en.js';
import { coreZhMessages } from './locales/zh.js';
import { coreJaMessages } from './locales/ja.js';

type CoreSupportedLanguage = 'en' | 'zh' | 'ja';

const CORE_SUPPORTED_LANGUAGES: CoreSupportedLanguage[] = ['en', 'zh', 'ja'];

// 语言包注册表
const CORE_LANGUAGE_REGISTRY: Record<CoreSupportedLanguage, CoreI18nMessages> = {
  en: coreEnMessages,
  zh: coreZhMessages,
  ja: coreJaMessages,
};

class CoreI18n {
  private currentLanguage: CoreSupportedLanguage = 'en';
  private messages: CoreI18nMessages = coreEnMessages;

  /**
   * 设置当前语言
   * @param language 语言代码
   */
  public setLanguage(language: string): void {
    if (this.isSupportedLanguage(language)) {
      this.currentLanguage = language;
      this.messages = CORE_LANGUAGE_REGISTRY[language];
    } else {
      console.warn(`Unsupported language: ${language}, falling back to English`);
      this.currentLanguage = 'en';
      this.messages = CORE_LANGUAGE_REGISTRY.en;
    }
  }

  /**
   * 获取当前语言
   */
  public getCurrentLanguage(): CoreSupportedLanguage {
    return this.currentLanguage;
  }

  /**
   * 检查是否支持指定语言
   */
  public isSupportedLanguage(language: string): language is CoreSupportedLanguage {
    return CORE_SUPPORTED_LANGUAGES.includes(language as CoreSupportedLanguage);
  }

  /**
   * 获取支持的语言列表
   */
  public getSupportedLanguages(): CoreSupportedLanguage[] {
    return [...CORE_SUPPORTED_LANGUAGES];
  }

  /**
   * 翻译文本
   * @param keyPath 翻译键路径，如 'tools.fileOperations.readFile'
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

// 全局 core i18n 实例
export const coreI18n = new CoreI18n();

// 便捷的翻译函数
export const coreT = (keyPath: string, params?: Record<string, any>): string => {
  return coreI18n.t(keyPath, params);
};

// 导出类型和常量
export { CoreSupportedLanguage, CORE_SUPPORTED_LANGUAGES };
export * from './types.js';
