/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { theme } from './semantic-colors.js';
import * as themeManagerModule from './themes/theme-manager.js';

vi.mock('./themes/theme-manager.js');

describe('semantic-colors', () => {
  const mockSemanticColors = {
    text: { primary: '#000000', secondary: '#666666' },
    background: { primary: '#FFFFFF', secondary: '#F0F0F0' },
    border: { default: '#CCCCCC', focus: '#0066CC' },
    ui: { accent: '#0066CC', muted: '#999999' },
    status: { success: '#00AA00', error: '#CC0000' },
  };

  beforeEach(() => {
    vi.mocked(
      themeManagerModule.themeManager.getSemanticColors,
    ).mockReturnValue(mockSemanticColors as never);
  });

  describe('theme object', () => {
    it('should have text property', () => {
      expect(theme.text).toBeDefined();
    });

    it('should have background property', () => {
      expect(theme.background).toBeDefined();
    });

    it('should have border property', () => {
      expect(theme.border).toBeDefined();
    });

    it('should have ui property', () => {
      expect(theme.ui).toBeDefined();
    });

    it('should have status property', () => {
      expect(theme.status).toBeDefined();
    });
  });

  describe('theme getters', () => {
    it('should get text from themeManager', () => {
      const text = theme.text;
      expect(text).toBe(mockSemanticColors.text);
      expect(
        themeManagerModule.themeManager.getSemanticColors,
      ).toHaveBeenCalled();
    });

    it('should get background from themeManager', () => {
      const background = theme.background;
      expect(background).toBe(mockSemanticColors.background);
    });

    it('should get border from themeManager', () => {
      const border = theme.border;
      expect(border).toBe(mockSemanticColors.border);
    });

    it('should get ui from themeManager', () => {
      const ui = theme.ui;
      expect(ui).toBe(mockSemanticColors.ui);
    });

    it('should get status from themeManager', () => {
      const status = theme.status;
      expect(status).toBe(mockSemanticColors.status);
    });
  });

  describe('dynamic theme updates', () => {
    it('should reflect changes when theme manager updates', () => {
      const newColors = {
        text: { primary: '#FFFFFF', secondary: '#CCCCCC' },
        background: { primary: '#000000', secondary: '#1A1A1A' },
        border: { default: '#333333', focus: '#0099FF' },
        ui: { accent: '#0099FF', muted: '#666666' },
        status: { success: '#00FF00', error: '#FF0000' },
      };

      vi.mocked(
        themeManagerModule.themeManager.getSemanticColors,
      ).mockReturnValue(newColors as never);

      expect(theme.text).toBe(newColors.text);
      expect(theme.background).toBe(newColors.background);
    });

    it('should call getSemanticColors each time a property is accessed', () => {
      vi.clearAllMocks();

      const _ = theme.text;
      expect(
        themeManagerModule.themeManager.getSemanticColors,
      ).toHaveBeenCalledTimes(1);

      const __ = theme.background;
      expect(
        themeManagerModule.themeManager.getSemanticColors,
      ).toHaveBeenCalledTimes(2);

      const ___ = theme.border;
      expect(
        themeManagerModule.themeManager.getSemanticColors,
      ).toHaveBeenCalledTimes(3);
    });
  });

  describe('theme structure', () => {
    it('should have exactly 5 color categories', () => {
      const keys = Object.keys(Object.getOwnPropertyDescriptors(theme));
      // Filter out non-color properties
      const colorKeys = keys.filter((k) =>
        ['text', 'background', 'border', 'ui', 'status'].includes(k),
      );
      expect(colorKeys).toHaveLength(5);
    });

    it('should use getters for all properties', () => {
      const descriptors = Object.getOwnPropertyDescriptors(theme);
      expect(descriptors.text.get).toBeDefined();
      expect(descriptors.background.get).toBeDefined();
      expect(descriptors.border.get).toBeDefined();
      expect(descriptors.ui.get).toBeDefined();
      expect(descriptors.status.get).toBeDefined();
    });
  });
});
