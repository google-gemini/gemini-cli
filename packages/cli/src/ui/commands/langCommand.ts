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
  description:
    'Switch interface language / 切换界面语言 / Changer la langue / Cambiar idioma',
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
            text: `Language switched to English`,
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
            text: `语言已切换到中文`,
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
      name: 'fr',
      description: 'Switch to French (Français)',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        try {
          await i18n.changeLanguage('fr');
          const infoItem: Omit<HistoryItemInfo, 'id'> = {
            type: MessageType.INFO,
            text: `Langue changée en français`,
          };
          context.ui.addItem(infoItem, Date.now());
        } catch (error) {
          const errorItem: Omit<HistoryItemInfo, 'id'> = {
            type: MessageType.INFO,
            text: '❌ Échec du changement de langue, veuillez réessayer',
          };
          context.ui.addItem(errorItem, Date.now());
        }
      },
    },
    {
      name: 'es',
      description: 'Switch to Spanish (Español)',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        try {
          await i18n.changeLanguage('es');
          const infoItem: Omit<HistoryItemInfo, 'id'> = {
            type: MessageType.INFO,
            text: `Idioma cambiado a español`,
          };
          context.ui.addItem(infoItem, Date.now());
        } catch (error) {
          const errorItem: Omit<HistoryItemInfo, 'id'> = {
            type: MessageType.INFO,
            text: '❌ Error al cambiar idioma, inténtalo de nuevo',
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
        const currentLangDisplay =
          i18n.language === 'zh'
            ? '中文 (zh)'
            : i18n.language === 'fr'
              ? 'Français (fr)'
              : i18n.language === 'es'
                ? 'Español (es)'
                : 'English (en)';
        const infoItem: Omit<HistoryItemInfo, 'id'> = {
          type: MessageType.INFO,
          text: currentLangDisplay,
        };
        context.ui.addItem(infoItem, Date.now());
      },
    },
  ],
  action: async (context, args) => {
    const subCommand = (args?.trim() || '') as
      | 'en'
      | 'zh'
      | 'fr'
      | 'es'
      | 'current'
      | '';

    if (!subCommand) {
      // Show usage with fallback
      const currentLangDisplay =
        i18n.language === 'zh'
          ? '中文 (zh)'
          : i18n.language === 'fr'
            ? 'Français (fr)'
            : i18n.language === 'es'
              ? 'Español (es)'
              : 'English (en)';
      const usageText = `Language / 语言 / Langue / Idioma\n\nUsage:\n  /lang en       - Switch to English\n  /lang zh       - 切换到中文\n  /lang fr       - Changer en français\n  /lang es       - Cambiar a español\n  /lang current  - Show current language / 显示当前语言 / Afficher la langue actuelle / Mostrar idioma actual`;

      let currentText;
      try {
        currentText = i18n.t('commands:lang.currentLanguage', {
          language: currentLangDisplay,
        });
      } catch (error) {
        currentText = currentLangDisplay;
      }

      const infoItem: Omit<HistoryItemInfo, 'id'> = {
        type: MessageType.INFO,
        text: `${usageText}\n\n${currentText}`,
      };
      context.ui.addItem(infoItem, Date.now());
      return;
    }

    if (subCommand === 'current') {
      const currentLangDisplay =
        i18n.language === 'zh'
          ? '中文 (zh)'
          : i18n.language === 'fr'
            ? 'Français (fr)'
            : i18n.language === 'es'
              ? 'Español (es)'
              : 'English (en)';
      let messageText;
      try {
        messageText = i18n.t('commands:lang.currentLanguage', {
          language: currentLangDisplay,
        });
      } catch (error) {
        messageText = currentLangDisplay;
      }
      const infoItem: Omit<HistoryItemInfo, 'id'> = {
        type: MessageType.INFO,
        text: `${messageText}`,
      };
      context.ui.addItem(infoItem, Date.now());
      return;
    }

    if (
      subCommand === 'en' ||
      subCommand === 'zh' ||
      subCommand === 'fr' ||
      subCommand === 'es'
    ) {
      try {
        // Change language
        await i18n.changeLanguage(subCommand);

        // Store preference (for future enhancement)
        // TODO: Save to user config file

        const languageDisplay =
          subCommand === 'zh'
            ? '中文'
            : subCommand === 'fr'
              ? 'français'
              : subCommand === 'es'
                ? 'español'
                : 'English';
        // Use fallback message if translation fails
        let successMessage;
        try {
          successMessage = i18n.t('commands:lang.languageChanged', {
            language: languageDisplay,
          });
        } catch (error) {
          successMessage =
            subCommand === 'zh'
              ? `语言已切换到 ${languageDisplay}`
              : subCommand === 'fr'
                ? `Langue changée en ${languageDisplay}`
                : subCommand === 'es'
                  ? `Idioma cambiado a ${languageDisplay}`
                  : `Language switched to ${languageDisplay}`;
        }

        const infoItem: Omit<HistoryItemInfo, 'id'> = {
          type: MessageType.INFO,
          text: `${successMessage}`,
        };
        context.ui.addItem(infoItem, Date.now());
        return;
      } catch (error) {
        // Fallback error handling
        const errorMsg =
          subCommand === 'zh'
            ? '❌ 语言切换失败，请重试'
            : subCommand === 'fr'
              ? '❌ Échec du changement de langue, veuillez réessayer'
              : subCommand === 'es'
                ? '❌ Error al cambiar idioma, inténtalo de nuevo'
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
        languages: 'en, zh, fr, es',
      });
    } catch (error) {
      errorMessage = `❌ Invalid language option: ${subCommand}\n\nSupported options: en, zh, fr, es, current`;
    }
    const infoItem: Omit<HistoryItemInfo, 'id'> = {
      type: MessageType.INFO,
      text: errorMessage,
    };
    context.ui.addItem(infoItem, Date.now());
  },
};
