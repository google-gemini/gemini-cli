/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand } from './types.js';
import { MessageType, type HistoryItemInfo } from '../types.js';
import i18n from '../../i18n/index.js';

export const langCommand: SlashCommand = {
  name: 'lang',
  description: 'Switch interface language / 切换界面语言',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'en',
      description: 'Switch to English',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        try {
          await i18n.changeLanguage('en');
          const infoItem: Omit<HistoryItemInfo, 'id'> = {
            type: MessageType.INFO,
            text: `🌐 Language switched to English`,
          };
          context.ui.addItem(infoItem, Date.now());
        } catch (error) {
          const errorItem: Omit<HistoryItemInfo, 'id'> = {
            type: MessageType.INFO,
            text: '❌ Failed to switch language, please try again',
          };
          context.ui.addItem(errorItem, Date.now());
        }
      },
    },
    {
      name: 'zh',
      description: 'Switch to Chinese (中文)',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        try {
          await i18n.changeLanguage('zh');
          const infoItem: Omit<HistoryItemInfo, 'id'> = {
            type: MessageType.INFO,
            text: `🌐 语言已切换到中文`,
          };
          context.ui.addItem(infoItem, Date.now());
        } catch (error) {
          const errorItem: Omit<HistoryItemInfo, 'id'> = {
            type: MessageType.INFO,
            text: '❌ 语言切换失败，请重试',
          };
          context.ui.addItem(errorItem, Date.now());
        }
      },
    },
    {
      name: 'current',
      description: 'Show current language / 显示当前语言',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        const currentLangDisplay = i18n.language === 'zh' ? '中文 (zh)' : 'English (en)';
        const infoItem: Omit<HistoryItemInfo, 'id'> = {
          type: MessageType.INFO,
          text: `🌐 Current language / 当前语言: ${currentLangDisplay}`,
        };
        context.ui.addItem(infoItem, Date.now());
      },
    },
  ],
  action: async (context, args) => {
    const subCommand = args?.[0] as 'en' | 'zh' | 'current' | undefined;

    if (!subCommand) {
      // Show usage with fallback
      const currentLangDisplay = i18n.language === 'zh' ? '中文 (zh)' : 'English (en)';
      const usageText = `🌐 Language / 语言\n\nUsage:\n  /lang en       - Switch to English\n  /lang zh       - 切换到中文\n  /lang current  - Show current language / 显示当前语言`;
      
      let currentText;
      try {
        currentText = i18n.t('commands:lang.currentLanguage', { language: currentLangDisplay });
      } catch (error) {
        currentText = `Current language / 当前语言: ${currentLangDisplay}`;
      }
      
      const infoItem: Omit<HistoryItemInfo, 'id'> = {
        type: MessageType.INFO,
        text: `${usageText}\n\n${currentText}`,
      };
      context.ui.addItem(infoItem, Date.now());
      return;
    }

    if (subCommand === 'current') {
      const currentLangDisplay = i18n.language === 'zh' ? '中文 (zh)' : 'English (en)';
      let messageText;
      try {
        messageText = i18n.t('commands:lang.currentLanguage', { language: currentLangDisplay });
      } catch (error) {
        messageText = `Current language / 当前语言: ${currentLangDisplay}`;
      }
      const infoItem: Omit<HistoryItemInfo, 'id'> = {
        type: MessageType.INFO,
        text: `🌐 ${messageText}`,
      };
      context.ui.addItem(infoItem, Date.now());
      return;
    }

    if (subCommand === 'en' || subCommand === 'zh') {
      try {
        // Change language
        await i18n.changeLanguage(subCommand);
        
        // Store preference (for future enhancement)
        // TODO: Save to user config file
        
        const languageDisplay = subCommand === 'zh' ? '中文' : 'English';
        // Use fallback message if translation fails
        let successMessage;
        try {
          successMessage = i18n.t('commands:lang.languageChanged', { language: languageDisplay });
        } catch (error) {
          successMessage = subCommand === 'zh' 
            ? `语言已切换到 ${languageDisplay}` 
            : `Language switched to ${languageDisplay}`;
        }
        
        const infoItem: Omit<HistoryItemInfo, 'id'> = {
          type: MessageType.INFO,
          text: `🌐 ${successMessage}`,
        };
        context.ui.addItem(infoItem, Date.now());
        return;
      } catch (error) {
        // Fallback error handling
        const errorMsg = subCommand === 'zh' 
          ? '❌ 语言切换失败，请重试' 
          : '❌ Failed to switch language, please try again';
        const errorItem: Omit<HistoryItemInfo, 'id'> = {
          type: MessageType.INFO,
          text: errorMsg,
        };
        context.ui.addItem(errorItem, Date.now());
        return;
      }
    }

    // Invalid subcommand
    let errorMessage;
    try {
      errorMessage = i18n.t('commands:lang.invalidLanguage', { 
        language: subCommand, 
        languages: 'en, zh' 
      });
    } catch (error) {
      errorMessage = `❌ Invalid language option: ${subCommand}\n\nSupported options: en, zh, current`;
    }
    const infoItem: Omit<HistoryItemInfo, 'id'> = {
      type: MessageType.INFO,
      text: errorMessage,
    };
    context.ui.addItem(infoItem, Date.now());
  },
};