/**
 * @license
 * Copyright 2025 Catppuccin
 * SPDX-License-Identifier: MIT
 */

import { type ColorsTheme, Theme } from './theme.js';

const catppuccinLatteColors: ColorsTheme = {
  type: 'light',
  Background: '#eff1f5',
  Foreground: '#4c4f69',
  LightBlue: '#209fb5',
  AccentBlue: '#1e66f5',
  AccentPurple: '#8839ef',
  AccentCyan: '#04a5e5',
  AccentGreen: '#40a02b',
  AccentYellow: '#df8e1d',
  AccentRed: '#d20f39',
  Comment: '#7c7f93',
  Gray: '#7c7f93',
  GradientColors: ['#ea76cb', '#179299'],
};

export const CatppuccinLatte: Theme = new Theme(
  'Catppuccin Latte',
  'light',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: catppuccinLatteColors.Background,
      color: catppuccinLatteColors.Foreground,
    },
    'hljs-built_in': {
      color: catppuccinLatteColors.AccentRed,
    },
    'hljs-class': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-keyword': {
      color: catppuccinLatteColors.AccentPurple,
    },
    'hljs-link': {
      color: catppuccinLatteColors.LightBlue,
      textDecoration: 'underline',
    },
    'hljs-literal': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-name': {
      color: catppuccinLatteColors.AccentBlue,
    },
    'hljs-number': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-symbol': {
      color: catppuccinLatteColors.AccentRed,
    },
    'hljs-type': {
      color: catppuccinLatteColors.AccentYellow,
    },

    'hljs-string': {
      color: catppuccinLatteColors.AccentGreen,
    },
    'hljs-meta-string': {
      color: catppuccinLatteColors.AccentGreen,
    },
    'hljs-regexp': {
      color: catppuccinLatteColors.AccentRed,
    },
    'hljs-template-tag': {
      color: catppuccinLatteColors.AccentRed,
    },
    'hljs-subst': {
      color: catppuccinLatteColors.Foreground,
    },
    'hljs-function': {
      color: catppuccinLatteColors.AccentBlue,
    },
    'hljs-title': {
      color: catppuccinLatteColors.Foreground,
    },
    'hljs-params': {
      color: catppuccinLatteColors.Foreground,
    },
    'hljs-formula': {
      color: catppuccinLatteColors.Foreground,
    },
    'hljs-comment': {
      color: catppuccinLatteColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: catppuccinLatteColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-doctag': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-meta': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-meta-keyword': {
      color: catppuccinLatteColors.AccentPurple,
    },
    'hljs-tag': {
      color: catppuccinLatteColors.Gray,
    },
    'hljs-variable': {
      color: catppuccinLatteColors.AccentPurple,
    },
    'hljs-template-variable': {
      color: catppuccinLatteColors.AccentPurple,
    },
    'hljs-attr': {
      color: catppuccinLatteColors.LightBlue,
    },
    'hljs-attribute': {
      color: catppuccinLatteColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: catppuccinLatteColors.LightBlue,
    },
    'hljs-section': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-bullet': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-selector-tag': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-selector-id': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-selector-class': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-selector-attr': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-selector-pseudo': {
      color: catppuccinLatteColors.AccentYellow,
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
  catppuccinLatteColors,
);
