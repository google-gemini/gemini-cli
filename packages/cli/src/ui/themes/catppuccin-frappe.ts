/**
 * @license
 * Copyright 2025 Catppuccin
 * SPDX-License-Identifier: MIT
 */

import { type ColorsTheme, Theme } from './theme.js';

const catppuccinFrappeColors: ColorsTheme = {
  type: 'dark',
  Background: '#303446',
  Foreground: '#c6d0f5',
  LightBlue: '#85c1dc',
  AccentBlue: '#8caaee',
  AccentPurple: '#ca9ee6',
  AccentCyan: '#99d1db',
  AccentGreen: '#a6d189',
  AccentYellow: '#e5c890',
  AccentRed: '#e78284',
  Comment: '#949cbb',
  Gray: '#949cbb',
  GradientColors: ['#f4b8e4', '#81c8be'],
};

export const CatppuccinFrappe: Theme = new Theme(
  'Catppuccin Frappe',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: catppuccinFrappeColors.Background,
      color: catppuccinFrappeColors.Foreground,
    },
    'hljs-built_in': {
      color: catppuccinFrappeColors.AccentRed,
    },
    'hljs-class': {
      color: catppuccinFrappeColors.AccentYellow,
    },
    'hljs-keyword': {
      color: catppuccinFrappeColors.AccentPurple,
    },
    'hljs-link': {
      color: catppuccinFrappeColors.LightBlue,
      textDecoration: 'underline',
    },
    'hljs-literal': {
      color: catppuccinFrappeColors.AccentYellow,
    },
    'hljs-name': {
      color: catppuccinFrappeColors.AccentBlue,
    },
    'hljs-number': {
      color: catppuccinFrappeColors.AccentYellow,
    },
    'hljs-symbol': {
      color: catppuccinFrappeColors.AccentRed,
    },
    'hljs-type': {
      color: catppuccinFrappeColors.AccentYellow,
    },

    'hljs-string': {
      color: catppuccinFrappeColors.AccentGreen,
    },
    'hljs-meta-string': {
      color: catppuccinFrappeColors.AccentGreen,
    },
    'hljs-regexp': {
      color: catppuccinFrappeColors.AccentRed,
    },
    'hljs-template-tag': {
      color: catppuccinFrappeColors.AccentRed,
    },
    'hljs-subst': {
      color: catppuccinFrappeColors.Foreground,
    },
    'hljs-function': {
      color: catppuccinFrappeColors.AccentBlue,
    },
    'hljs-title': {
      color: catppuccinFrappeColors.Foreground,
    },
    'hljs-params': {
      color: catppuccinFrappeColors.Foreground,
    },
    'hljs-formula': {
      color: catppuccinFrappeColors.Foreground,
    },
    'hljs-comment': {
      color: catppuccinFrappeColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: catppuccinFrappeColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-doctag': {
      color: catppuccinFrappeColors.AccentYellow,
    },
    'hljs-meta': {
      color: catppuccinFrappeColors.AccentYellow,
    },
    'hljs-meta-keyword': {
      color: catppuccinFrappeColors.AccentPurple,
    },
    'hljs-tag': {
      color: catppuccinFrappeColors.Gray,
    },
    'hljs-variable': {
      color: catppuccinFrappeColors.AccentPurple,
    },
    'hljs-template-variable': {
      color: catppuccinFrappeColors.AccentPurple,
    },
    'hljs-attr': {
      color: catppuccinFrappeColors.LightBlue,
    },
    'hljs-attribute': {
      color: catppuccinFrappeColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: catppuccinFrappeColors.LightBlue,
    },
    'hljs-section': {
      color: catppuccinFrappeColors.AccentYellow,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-bullet': {
      color: catppuccinFrappeColors.AccentYellow,
    },
    'hljs-selector-tag': {
      color: catppuccinFrappeColors.AccentYellow,
    },
    'hljs-selector-id': {
      color: catppuccinFrappeColors.AccentYellow,
    },
    'hljs-selector-class': {
      color: catppuccinFrappeColors.AccentYellow,
    },
    'hljs-selector-attr': {
      color: catppuccinFrappeColors.AccentYellow,
    },
    'hljs-selector-pseudo': {
      color: catppuccinFrappeColors.AccentYellow,
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
  catppuccinFrappeColors,
);
