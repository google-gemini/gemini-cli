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
  AccentPurple: '#7287fd',
  AccentCyan: '#04a5e5',
  AccentGreen: '#40a02b',
  AccentYellow: '#df8e1d',
  AccentRed: '#d20f39',
  Comment: '#5c5f77',
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
    'hljs-keyword': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-literal': {
      color: catppuccinLatteColors.AccentPurple,
    },
    'hljs-symbol': {
      color: catppuccinLatteColors.AccentCyan,
    },
    'hljs-name': {
      color: catppuccinLatteColors.LightBlue,
    },
    'hljs-link': {
      color: catppuccinLatteColors.AccentBlue,
    },
    'hljs-function .hljs-keyword': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-subst': {
      color: catppuccinLatteColors.Foreground,
    },
    'hljs-string': {
      color: catppuccinLatteColors.AccentGreen,
    },
    'hljs-title': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-type': {
      color: catppuccinLatteColors.AccentBlue,
    },
    'hljs-attribute': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-bullet': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-addition': {
      color: catppuccinLatteColors.AccentGreen,
    },
    'hljs-variable': {
      color: catppuccinLatteColors.Foreground,
    },
    'hljs-template-tag': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-comment': {
      color: catppuccinLatteColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: catppuccinLatteColors.AccentCyan,
      fontStyle: 'italic',
    },
    'hljs-deletion': {
      color: catppuccinLatteColors.AccentRed,
    },
    'hljs-meta': {
      color: catppuccinLatteColors.AccentYellow,
    },
    'hljs-doctag': {
      fontWeight: 'bold',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
  },
  catppuccinLatteColors,
);
