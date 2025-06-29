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
  AccentPurple: '#babbf1',
  AccentCyan: '#99d1db',
  AccentGreen: '#a6d189',
  AccentYellow: '#e5c890',
  AccentRed: '#e78284',
  Comment: '#b5bfe2',
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
    'hljs-keyword': {
      color: catppuccinFrappeColors.AccentYellow,
    },
    'hljs-literal': {
      color: catppuccinFrappeColors.AccentPurple,
    },
    'hljs-symbol': {
      color: catppuccinFrappeColors.AccentCyan,
    },
    'hljs-name': {
      color: catppuccinFrappeColors.LightBlue,
    },
    'hljs-link': {
      color: catppuccinFrappeColors.AccentBlue,
    },
    'hljs-function .hljs-keyword': {
      color: catppuccinFrappeColors.AccentYellow,
    },
    'hljs-subst': {
      color: catppuccinFrappeColors.Foreground,
    },
    'hljs-string': {
      color: catppuccinFrappeColors.AccentGreen,
    },
    'hljs-title': {
      color: catppuccinFrappeColors.AccentYellow,
    },
    'hljs-type': {
      color: catppuccinFrappeColors.AccentBlue,
    },
    'hljs-attribute': {
      color: catppuccinFrappeColors.AccentYellow,
    },
    'hljs-bullet': {
      color: catppuccinFrappeColors.AccentYellow,
    },
    'hljs-addition': {
      color: catppuccinFrappeColors.AccentGreen,
    },
    'hljs-variable': {
      color: catppuccinFrappeColors.Foreground,
    },
    'hljs-template-tag': {
      color: catppuccinFrappeColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: catppuccinFrappeColors.AccentYellow,
    },
    'hljs-comment': {
      color: catppuccinFrappeColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: catppuccinFrappeColors.AccentCyan,
      fontStyle: 'italic',
    },
    'hljs-deletion': {
      color: catppuccinFrappeColors.AccentRed,
    },
    'hljs-meta': {
      color: catppuccinFrappeColors.AccentYellow,
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
  catppuccinFrappeColors,
);
