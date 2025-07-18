/**
 * @license
 * Copyright 2025 Catppuccin
 * SPDX-License-Identifier: MIT
 */

import { type ColorsTheme, Theme } from './theme.js';

const catppuccinMochaColors: ColorsTheme = {
  type: 'dark',
  Background: '#1e1e2e',
  Foreground: '#cdd6f4',
  LightBlue: '#74c7ec',
  AccentBlue: '#89b4fa',
  AccentPurple: '#cba6f7',
  AccentCyan: '#89dceb',
  AccentGreen: '#a6e3a1',
  AccentYellow: '#f9e2af',
  AccentRed: '#f38ba8',
  Comment: '#9399b2',
  Gray: '#6c7086',
  GradientColors: ['#f5c2e7', '#94e2d5'],
};

export const CatppuccinMocha: Theme = new Theme(
  'Catppuccin Mocha',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: catppuccinMochaColors.Background,
      color: catppuccinMochaColors.Foreground,
    },
    'hljs-built_in': {
      color: catppuccinMochaColors.AccentRed,
    },
    'hljs-class': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-keyword': {
      color: catppuccinMochaColors.AccentPurple,
    },
    'hljs-link': {
      color: catppuccinMochaColors.LightBlue,
      textDecoration: 'underline',
    },
    'hljs-literal': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-name': {
      color: catppuccinMochaColors.AccentBlue,
    },
    'hljs-number': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-symbol': {
      color: catppuccinMochaColors.AccentRed,
    },
    'hljs-type': {
      color: catppuccinMochaColors.AccentYellow,
    },

    'hljs-string': {
      color: catppuccinMochaColors.AccentGreen,
    },
    'hljs-meta-string': {
      color: catppuccinMochaColors.AccentGreen,
    },
    'hljs-regexp': {
      color: catppuccinMochaColors.AccentRed,
    },
    'hljs-template-tag': {
      color: catppuccinMochaColors.AccentRed,
    },
    'hljs-subst': {
      color: catppuccinMochaColors.Foreground,
    },
    'hljs-function': {
      color: catppuccinMochaColors.AccentBlue,
    },
    'hljs-title': {
      color: catppuccinMochaColors.Foreground,
    },
    'hljs-params': {
      color: catppuccinMochaColors.Foreground,
    },
    'hljs-formula': {
      color: catppuccinMochaColors.Foreground,
    },
    'hljs-comment': {
      color: catppuccinMochaColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: catppuccinMochaColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-doctag': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-meta': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-meta-keyword': {
      color: catppuccinMochaColors.AccentPurple,
    },
    'hljs-tag': {
      color: catppuccinMochaColors.Gray,
    },
    'hljs-variable': {
      color: catppuccinMochaColors.AccentPurple,
    },
    'hljs-template-variable': {
      color: catppuccinMochaColors.AccentPurple,
    },
    'hljs-attr': {
      color: catppuccinMochaColors.LightBlue,
    },
    'hljs-attribute': {
      color: catppuccinMochaColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: catppuccinMochaColors.LightBlue,
    },
    'hljs-section': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-bullet': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-selector-tag': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-selector-id': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-selector-class': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-selector-attr': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-selector-pseudo': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-addition': {
      backgroundColor: '#144212',
      display: 'inline-block',
      width: '100%',
    },
    'hljs-deletion': {
      backgroundColor: '#600',
      display: 'inline-block',
      width: '100%',
    },
  },
  catppuccinMochaColors,
);
