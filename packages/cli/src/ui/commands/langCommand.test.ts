/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { langCommand } from './langCommand.js';
import { MessageType } from '../types.js';
import i18n from '../../i18n/index.js';

// Mock the i18n module
vi.mock('../../i18n/index.js', () => ({
  default: {
    changeLanguage: vi.fn(),
    language: 'en',
    t: vi.fn(() => {
      // Default to throw error so fallback messages are used
      throw new Error('Translation not found');
    }),
  },
}));

const mockI18n = vi.mocked(i18n);

describe('langCommand', () => {
  let mockContext: any;

  beforeEach(() => {
    mockContext = {
      ui: {
        addItem: vi.fn(),
      },
    };
    vi.clearAllMocks();
    // Reset to English by default
    mockI18n.language = 'en';
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Basic Command Properties', () => {
    it('should have correct command properties', () => {
      expect(langCommand.name).toBe('lang');
      expect(langCommand.description).toContain('Switch interface language');
      expect(langCommand.subCommands).toHaveLength(5);
    });

    it('should have all expected subcommands', () => {
      const subCommandNames = langCommand.subCommands?.map((cmd) => cmd.name);
      expect(subCommandNames).toEqual(['en', 'zh', 'fr', 'es', 'current']);
    });
  });

  describe('Language Switching Functionality', () => {
    it('should switch to English successfully', async () => {
      mockI18n.changeLanguage.mockResolvedValue({} as any);

      await langCommand.action!(mockContext, 'en');

      expect(mockI18n.changeLanguage).toHaveBeenCalledWith('en');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('English'),
        }),
        expect.any(Number),
      );
    });

    it('should switch to Chinese successfully', async () => {
      mockI18n.changeLanguage.mockResolvedValue({} as any);

      await langCommand.action!(mockContext, 'zh');

      expect(mockI18n.changeLanguage).toHaveBeenCalledWith('zh');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('中文'),
        }),
        expect.any(Number),
      );
    });

    it('should switch to French successfully', async () => {
      mockI18n.changeLanguage.mockResolvedValue({} as any);

      await langCommand.action!(mockContext, 'fr');

      expect(mockI18n.changeLanguage).toHaveBeenCalledWith('fr');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('français'),
        }),
        expect.any(Number),
      );
    });

    it('should switch to Spanish successfully', async () => {
      mockI18n.changeLanguage.mockResolvedValue({} as any);

      await langCommand.action!(mockContext, 'es');

      expect(mockI18n.changeLanguage).toHaveBeenCalledWith('es');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('español'),
        }),
        expect.any(Number),
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle language switching errors gracefully', async () => {
      mockI18n.changeLanguage.mockRejectedValue(new Error('Switch failed'));

      await langCommand.action!(mockContext, 'zh');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('❌'),
        }),
        expect.any(Number),
      );
    });

    it('should show error for invalid language', async () => {
      await langCommand.action!(mockContext, 'invalid');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('❌'),
        }),
        expect.any(Number),
      );
    });
  });

  describe('Current Language Display', () => {
    it('should show current language when language is English', async () => {
      mockI18n.language = 'en';

      await langCommand.action!(mockContext, 'current');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('English'),
        }),
        expect.any(Number),
      );
    });

    it('should show current language when language is Chinese', async () => {
      mockI18n.language = 'zh';

      await langCommand.action!(mockContext, 'current');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('中文'),
        }),
        expect.any(Number),
      );
    });

    it('should show current language when language is French', async () => {
      mockI18n.language = 'fr';

      await langCommand.action!(mockContext, 'current');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Français'),
        }),
        expect.any(Number),
      );
    });

    it('should show current language when language is Spanish', async () => {
      mockI18n.language = 'es';

      await langCommand.action!(mockContext, 'current');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Español'),
        }),
        expect.any(Number),
      );
    });
  });

  describe('Usage Information', () => {
    it('should show usage when no arguments provided', async () => {
      await langCommand.action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringMatching(/Usage:\s*\/lang en/),
        }),
        expect.any(Number),
      );
    });

    it('should show usage when undefined arguments provided', async () => {
      await langCommand.action!(mockContext, undefined as any);

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringMatching(/Usage:\s*\/lang en/),
        }),
        expect.any(Number),
      );
    });
  });

  describe('SubCommand Direct Actions', () => {
    it('should execute English subcommand action directly', async () => {
      const enSubCommand = langCommand.subCommands?.find(
        (cmd) => cmd.name === 'en',
      );
      expect(enSubCommand).toBeDefined();

      mockI18n.changeLanguage.mockResolvedValue({} as any);

      await enSubCommand!.action!(mockContext, '');

      expect(mockI18n.changeLanguage).toHaveBeenCalledWith('en');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'Language switched to English',
        }),
        expect.any(Number),
      );
    });

    it('should execute Chinese subcommand action directly', async () => {
      const zhSubCommand = langCommand.subCommands?.find(
        (cmd) => cmd.name === 'zh',
      );
      expect(zhSubCommand).toBeDefined();

      mockI18n.changeLanguage.mockResolvedValue({} as any);

      await zhSubCommand!.action!(mockContext, '');

      expect(mockI18n.changeLanguage).toHaveBeenCalledWith('zh');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: '语言已切换到中文',
        }),
        expect.any(Number),
      );
    });

    it('should handle subcommand errors', async () => {
      const zhSubCommand = langCommand.subCommands?.find(
        (cmd) => cmd.name === 'zh',
      );
      expect(zhSubCommand).toBeDefined();

      mockI18n.changeLanguage.mockRejectedValue(new Error('Failed'));

      await zhSubCommand!.action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: '❌ 语言切换失败，请重试',
        }),
        expect.any(Number),
      );
    });
  });

  describe('Translation System Integration', () => {
    it('should use translation system when available', async () => {
      mockI18n.t.mockReturnValue('Translated success message');
      mockI18n.changeLanguage.mockResolvedValue({} as any);

      await langCommand.action!(mockContext, 'en');

      expect(mockI18n.t).toHaveBeenCalledWith(
        'commands:lang.languageChanged',
        expect.objectContaining({ language: 'English' }),
      );
    });

    it('should fallback when translation system fails', async () => {
      mockI18n.t.mockImplementation(() => {
        throw new Error('Translation failed');
      });
      mockI18n.changeLanguage.mockResolvedValue({} as any);

      await langCommand.action!(mockContext, 'zh');

      // Should still show message even when translation fails
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('中文'),
        }),
        expect.any(Number),
      );
    });
  });

  describe('Multi-language Workflow Test', () => {
    it('should handle complete language switching workflow', async () => {
      mockI18n.changeLanguage.mockResolvedValue({} as any);

      // Step 1: Check current language (English)
      await langCommand.action!(mockContext, 'current');
      expect(mockContext.ui.addItem).toHaveBeenLastCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('English'),
        }),
        expect.any(Number),
      );

      // Step 2: Switch to Chinese
      mockI18n.language = 'zh';
      await langCommand.action!(mockContext, 'zh');
      expect(mockI18n.changeLanguage).toHaveBeenCalledWith('zh');

      // Step 3: Check current language (Chinese)
      await langCommand.action!(mockContext, 'current');
      expect(mockContext.ui.addItem).toHaveBeenLastCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('中文'),
        }),
        expect.any(Number),
      );

      // Step 4: Switch to French
      mockI18n.language = 'fr';
      await langCommand.action!(mockContext, 'fr');
      expect(mockI18n.changeLanguage).toHaveBeenCalledWith('fr');

      // Step 5: Check current language (French)
      await langCommand.action!(mockContext, 'current');
      expect(mockContext.ui.addItem).toHaveBeenLastCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Français'),
        }),
        expect.any(Number),
      );
    });
  });
});
