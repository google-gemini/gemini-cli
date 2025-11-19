/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { SemanticColors } from './semantic-tokens.js';
import {
  lightSemanticColors,
  darkSemanticColors,
  ansiSemanticColors,
} from './semantic-tokens.js';
import { lightTheme, darkTheme, ansiTheme } from './theme.js';

describe('semantic-tokens', () => {
  describe('SemanticColors interface', () => {
    it('should define text colors structure', () => {
      const colors: SemanticColors = lightSemanticColors;
      expect(colors.text).toBeDefined();
      expect(colors.text.primary).toBeDefined();
      expect(colors.text.secondary).toBeDefined();
      expect(colors.text.link).toBeDefined();
      expect(colors.text.accent).toBeDefined();
    });

    it('should define background colors structure', () => {
      const colors: SemanticColors = lightSemanticColors;
      expect(colors.background).toBeDefined();
      expect(colors.background.primary).toBeDefined();
      expect(colors.background.diff).toBeDefined();
      expect(colors.background.diff.added).toBeDefined();
      expect(colors.background.diff.removed).toBeDefined();
    });

    it('should define border colors structure', () => {
      const colors: SemanticColors = lightSemanticColors;
      expect(colors.border).toBeDefined();
      expect(colors.border.default).toBeDefined();
      expect(colors.border.focused).toBeDefined();
    });

    it('should define UI colors structure', () => {
      const colors: SemanticColors = lightSemanticColors;
      expect(colors.ui).toBeDefined();
      expect(colors.ui.comment).toBeDefined();
      expect(colors.ui.symbol).toBeDefined();
    });

    it('should define status colors structure', () => {
      const colors: SemanticColors = lightSemanticColors;
      expect(colors.status).toBeDefined();
      expect(colors.status.error).toBeDefined();
      expect(colors.status.success).toBeDefined();
      expect(colors.status.warning).toBeDefined();
    });
  });

  describe('lightSemanticColors', () => {
    it('should be defined', () => {
      expect(lightSemanticColors).toBeDefined();
    });

    describe('text colors', () => {
      it('should use lightTheme Foreground for primary', () => {
        expect(lightSemanticColors.text.primary).toBe(lightTheme.Foreground);
      });

      it('should use lightTheme Gray for secondary', () => {
        expect(lightSemanticColors.text.secondary).toBe(lightTheme.Gray);
      });

      it('should use lightTheme AccentBlue for link', () => {
        expect(lightSemanticColors.text.link).toBe(lightTheme.AccentBlue);
      });

      it('should use lightTheme AccentPurple for accent', () => {
        expect(lightSemanticColors.text.accent).toBe(lightTheme.AccentPurple);
      });
    });

    describe('background colors', () => {
      it('should use lightTheme Background for primary', () => {
        expect(lightSemanticColors.background.primary).toBe(
          lightTheme.Background,
        );
      });

      it('should use lightTheme DiffAdded for diff.added', () => {
        expect(lightSemanticColors.background.diff.added).toBe(
          lightTheme.DiffAdded,
        );
      });

      it('should use lightTheme DiffRemoved for diff.removed', () => {
        expect(lightSemanticColors.background.diff.removed).toBe(
          lightTheme.DiffRemoved,
        );
      });
    });

    describe('border colors', () => {
      it('should use lightTheme Gray for default', () => {
        expect(lightSemanticColors.border.default).toBe(lightTheme.Gray);
      });

      it('should use lightTheme AccentBlue for focused', () => {
        expect(lightSemanticColors.border.focused).toBe(lightTheme.AccentBlue);
      });
    });

    describe('UI colors', () => {
      it('should use lightTheme Comment for comment', () => {
        expect(lightSemanticColors.ui.comment).toBe(lightTheme.Comment);
      });

      it('should use lightTheme Gray for symbol', () => {
        expect(lightSemanticColors.ui.symbol).toBe(lightTheme.Gray);
      });

      it('should use lightTheme GradientColors for gradient', () => {
        expect(lightSemanticColors.ui.gradient).toBe(lightTheme.GradientColors);
      });
    });

    describe('status colors', () => {
      it('should use lightTheme AccentRed for error', () => {
        expect(lightSemanticColors.status.error).toBe(lightTheme.AccentRed);
      });

      it('should use lightTheme AccentGreen for success', () => {
        expect(lightSemanticColors.status.success).toBe(lightTheme.AccentGreen);
      });

      it('should use lightTheme AccentYellow for warning', () => {
        expect(lightSemanticColors.status.warning).toBe(
          lightTheme.AccentYellow,
        );
      });
    });
  });

  describe('darkSemanticColors', () => {
    it('should be defined', () => {
      expect(darkSemanticColors).toBeDefined();
    });

    describe('text colors', () => {
      it('should use darkTheme Foreground for primary', () => {
        expect(darkSemanticColors.text.primary).toBe(darkTheme.Foreground);
      });

      it('should use darkTheme Gray for secondary', () => {
        expect(darkSemanticColors.text.secondary).toBe(darkTheme.Gray);
      });

      it('should use darkTheme AccentBlue for link', () => {
        expect(darkSemanticColors.text.link).toBe(darkTheme.AccentBlue);
      });

      it('should use darkTheme AccentPurple for accent', () => {
        expect(darkSemanticColors.text.accent).toBe(darkTheme.AccentPurple);
      });
    });

    describe('background colors', () => {
      it('should use darkTheme Background for primary', () => {
        expect(darkSemanticColors.background.primary).toBe(
          darkTheme.Background,
        );
      });

      it('should use darkTheme DiffAdded for diff.added', () => {
        expect(darkSemanticColors.background.diff.added).toBe(
          darkTheme.DiffAdded,
        );
      });

      it('should use darkTheme DiffRemoved for diff.removed', () => {
        expect(darkSemanticColors.background.diff.removed).toBe(
          darkTheme.DiffRemoved,
        );
      });
    });

    describe('border colors', () => {
      it('should use darkTheme Gray for default', () => {
        expect(darkSemanticColors.border.default).toBe(darkTheme.Gray);
      });

      it('should use darkTheme AccentBlue for focused', () => {
        expect(darkSemanticColors.border.focused).toBe(darkTheme.AccentBlue);
      });
    });

    describe('UI colors', () => {
      it('should use darkTheme Comment for comment', () => {
        expect(darkSemanticColors.ui.comment).toBe(darkTheme.Comment);
      });

      it('should use darkTheme Gray for symbol', () => {
        expect(darkSemanticColors.ui.symbol).toBe(darkTheme.Gray);
      });

      it('should use darkTheme GradientColors for gradient', () => {
        expect(darkSemanticColors.ui.gradient).toBe(darkTheme.GradientColors);
      });
    });

    describe('status colors', () => {
      it('should use darkTheme AccentRed for error', () => {
        expect(darkSemanticColors.status.error).toBe(darkTheme.AccentRed);
      });

      it('should use darkTheme AccentGreen for success', () => {
        expect(darkSemanticColors.status.success).toBe(darkTheme.AccentGreen);
      });

      it('should use darkTheme AccentYellow for warning', () => {
        expect(darkSemanticColors.status.warning).toBe(darkTheme.AccentYellow);
      });
    });
  });

  describe('ansiSemanticColors', () => {
    it('should be defined', () => {
      expect(ansiSemanticColors).toBeDefined();
    });

    describe('text colors', () => {
      it('should use ansiTheme Foreground for primary', () => {
        expect(ansiSemanticColors.text.primary).toBe(ansiTheme.Foreground);
      });

      it('should use ansiTheme Gray for secondary', () => {
        expect(ansiSemanticColors.text.secondary).toBe(ansiTheme.Gray);
      });

      it('should use ansiTheme AccentBlue for link', () => {
        expect(ansiSemanticColors.text.link).toBe(ansiTheme.AccentBlue);
      });

      it('should use ansiTheme AccentPurple for accent', () => {
        expect(ansiSemanticColors.text.accent).toBe(ansiTheme.AccentPurple);
      });
    });

    describe('background colors', () => {
      it('should use ansiTheme Background for primary', () => {
        expect(ansiSemanticColors.background.primary).toBe(
          ansiTheme.Background,
        );
      });

      it('should use ansiTheme DiffAdded for diff.added', () => {
        expect(ansiSemanticColors.background.diff.added).toBe(
          ansiTheme.DiffAdded,
        );
      });

      it('should use ansiTheme DiffRemoved for diff.removed', () => {
        expect(ansiSemanticColors.background.diff.removed).toBe(
          ansiTheme.DiffRemoved,
        );
      });
    });

    describe('border colors', () => {
      it('should use ansiTheme Gray for default', () => {
        expect(ansiSemanticColors.border.default).toBe(ansiTheme.Gray);
      });

      it('should use ansiTheme AccentBlue for focused', () => {
        expect(ansiSemanticColors.border.focused).toBe(ansiTheme.AccentBlue);
      });
    });

    describe('UI colors', () => {
      it('should use ansiTheme Comment for comment', () => {
        expect(ansiSemanticColors.ui.comment).toBe(ansiTheme.Comment);
      });

      it('should use ansiTheme Gray for symbol', () => {
        expect(ansiSemanticColors.ui.symbol).toBe(ansiTheme.Gray);
      });

      it('should use ansiTheme GradientColors for gradient', () => {
        expect(ansiSemanticColors.ui.gradient).toBe(ansiTheme.GradientColors);
      });
    });

    describe('status colors', () => {
      it('should use ansiTheme AccentRed for error', () => {
        expect(ansiSemanticColors.status.error).toBe(ansiTheme.AccentRed);
      });

      it('should use ansiTheme AccentGreen for success', () => {
        expect(ansiSemanticColors.status.success).toBe(ansiTheme.AccentGreen);
      });

      it('should use ansiTheme AccentYellow for warning', () => {
        expect(ansiSemanticColors.status.warning).toBe(ansiTheme.AccentYellow);
      });
    });
  });

  describe('consistency across themes', () => {
    it('should have same structure for all themes', () => {
      const themes = [
        lightSemanticColors,
        darkSemanticColors,
        ansiSemanticColors,
      ];

      for (const theme of themes) {
        expect(theme.text).toBeDefined();
        expect(theme.background).toBeDefined();
        expect(theme.border).toBeDefined();
        expect(theme.ui).toBeDefined();
        expect(theme.status).toBeDefined();
      }
    });

    it('should have same text color keys', () => {
      const keys = ['primary', 'secondary', 'link', 'accent'];
      const themes = [
        lightSemanticColors,
        darkSemanticColors,
        ansiSemanticColors,
      ];

      for (const theme of themes) {
        for (const key of keys) {
          expect(theme.text).toHaveProperty(key);
        }
      }
    });

    it('should have same status color keys', () => {
      const keys = ['error', 'success', 'warning'];
      const themes = [
        lightSemanticColors,
        darkSemanticColors,
        ansiSemanticColors,
      ];

      for (const theme of themes) {
        for (const key of keys) {
          expect(theme.status).toHaveProperty(key);
        }
      }
    });

    it('should have all colors as strings', () => {
      const themes = [
        lightSemanticColors,
        darkSemanticColors,
        ansiSemanticColors,
      ];

      for (const theme of themes) {
        expect(typeof theme.text.primary).toBe('string');
        expect(typeof theme.text.secondary).toBe('string');
        expect(typeof theme.text.link).toBe('string');
        expect(typeof theme.text.accent).toBe('string');
        expect(typeof theme.background.primary).toBe('string');
        expect(typeof theme.border.default).toBe('string');
        expect(typeof theme.border.focused).toBe('string');
        expect(typeof theme.status.error).toBe('string');
        expect(typeof theme.status.success).toBe('string');
        expect(typeof theme.status.warning).toBe('string');
      }
    });
  });

  describe('color value formats', () => {
    it('should use valid color values for light theme', () => {
      expect(lightSemanticColors.text.primary).toBeDefined();
      expect(lightSemanticColors.text.secondary).toMatch(/#[0-9a-fA-F]{6}/);
      expect(lightSemanticColors.text.link).toMatch(/#[0-9a-fA-F]{6}/);
    });

    it('should use valid color values for dark theme', () => {
      expect(darkSemanticColors.text.primary).toBeDefined();
      expect(darkSemanticColors.text.secondary).toMatch(/#[0-9a-fA-F]{6}/);
      expect(darkSemanticColors.text.link).toMatch(/#[0-9a-fA-F]{6}/);
    });

    it('should use ANSI color names for ansi theme', () => {
      expect(ansiSemanticColors.background.primary).toBe('black');
      expect(ansiSemanticColors.text.primary).toBe('white');
    });
  });

  describe('gradient colors', () => {
    it('should have gradient array for light theme', () => {
      expect(Array.isArray(lightSemanticColors.ui.gradient)).toBe(true);
      expect(lightSemanticColors.ui.gradient?.length).toBeGreaterThan(0);
    });

    it('should have gradient array for dark theme', () => {
      expect(Array.isArray(darkSemanticColors.ui.gradient)).toBe(true);
      expect(darkSemanticColors.ui.gradient?.length).toBeGreaterThan(0);
    });

    it('should allow undefined gradient', () => {
      const colors: SemanticColors = {
        text: {
          primary: '#000',
          secondary: '#666',
          link: '#00f',
          accent: '#f0f',
        },
        background: {
          primary: '#fff',
          diff: {
            added: '#0f0',
            removed: '#f00',
          },
        },
        border: {
          default: '#ccc',
          focused: '#00f',
        },
        ui: {
          comment: '#888',
          symbol: '#666',
          gradient: undefined,
        },
        status: {
          error: '#f00',
          success: '#0f0',
          warning: '#ff0',
        },
      };

      expect(colors.ui.gradient).toBeUndefined();
    });
  });

  describe('semantic mappings', () => {
    it('should map error status to red accent', () => {
      expect(lightSemanticColors.status.error).toBe(lightTheme.AccentRed);
      expect(darkSemanticColors.status.error).toBe(darkTheme.AccentRed);
      expect(ansiSemanticColors.status.error).toBe(ansiTheme.AccentRed);
    });

    it('should map success status to green accent', () => {
      expect(lightSemanticColors.status.success).toBe(lightTheme.AccentGreen);
      expect(darkSemanticColors.status.success).toBe(darkTheme.AccentGreen);
      expect(ansiSemanticColors.status.success).toBe(ansiTheme.AccentGreen);
    });

    it('should map warning status to yellow accent', () => {
      expect(lightSemanticColors.status.warning).toBe(lightTheme.AccentYellow);
      expect(darkSemanticColors.status.warning).toBe(darkTheme.AccentYellow);
      expect(ansiSemanticColors.status.warning).toBe(ansiTheme.AccentYellow);
    });

    it('should map link to accent blue', () => {
      expect(lightSemanticColors.text.link).toBe(lightTheme.AccentBlue);
      expect(darkSemanticColors.text.link).toBe(darkTheme.AccentBlue);
      expect(ansiSemanticColors.text.link).toBe(ansiTheme.AccentBlue);
    });

    it('should map focused border to accent blue', () => {
      expect(lightSemanticColors.border.focused).toBe(lightTheme.AccentBlue);
      expect(darkSemanticColors.border.focused).toBe(darkTheme.AccentBlue);
      expect(ansiSemanticColors.border.focused).toBe(ansiTheme.AccentBlue);
    });
  });
});
