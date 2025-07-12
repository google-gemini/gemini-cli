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
  AccentPurple: '#b4befe',
  AccentCyan: '#89dceb',
  AccentGreen: '#a6e3a1',
  AccentYellow: '#f9e2af',
  AccentRed: '#f38ba8',
  Comment: '#bac2de',
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
    'hljs-keyword': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-literal': {
      color: catppuccinMochaColors.AccentPurple,
    },
    'hljs-symbol': {
      color: catppuccinMochaColors.AccentCyan,
    },
    'hljs-name': {
      color: catppuccinMochaColors.LightBlue,
    },
    'hljs-link': {
      color: catppuccinMochaColors.AccentBlue,
    },
    'hljs-function .hljs-keyword': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-subst': {
      color: catppuccinMochaColors.Foreground,
    },
    'hljs-string': {
      color: catppuccinMochaColors.AccentGreen,
    },
    'hljs-title': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-type': {
      color: catppuccinMochaColors.AccentBlue,
    },
    'hljs-attribute': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-bullet': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-addition': {
      color: catppuccinMochaColors.AccentGreen,
    },
    'hljs-variable': {
      color: catppuccinMochaColors.Foreground,
    },
    'hljs-template-tag': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: catppuccinMochaColors.AccentYellow,
    },
    'hljs-comment': {
      color: catppuccinMochaColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: catppuccinMochaColors.AccentCyan,
      fontStyle: 'italic',
    },
    'hljs-deletion': {
      color: catppuccinMochaColors.AccentRed,
    },
    'hljs-meta': {
      color: catppuccinMochaColors.AccentYellow,
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
  catppuccinMochaColors,
);
