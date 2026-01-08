/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { interpolateColor } from './color-utils.js';

// Gruvbox Dark color palette
// https://github.com/morhetz/gruvbox
const gruvboxColors: ColorsTheme = {
  type: 'dark',
  Background: '#282828',
  Foreground: '#ebdbb2',
  LightBlue: '#83a598',
  AccentBlue: '#83a598',
  AccentPurple: '#d3869b',
  AccentCyan: '#8ec07c',
  AccentGreen: '#b8bb26',
  AccentYellow: '#fabd2f',
  AccentRed: '#fb4934',
  DiffAdded: interpolateColor('#b8bb26', '#282828', 0.85),
  DiffRemoved: interpolateColor('#fb4934', '#282828', 0.85),
  Comment: '#665c54',
  Gray: '#928374',
  DarkGray: interpolateColor('#665c54', '#282828', 0.5),
  GradientColors: ['#fe8019', '#fabd2f'],
};

// Additional Gruvbox colors for syntax highlighting
const orange = '#fe8019';
const neutral_orange = '#d65d0e';

export const Gruvbox: Theme = new Theme(
  'Gruvbox',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: gruvboxColors.Background,
      color: gruvboxColors.Foreground,
    },
    'hljs-keyword': {
      color: gruvboxColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: gruvboxColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: orange,
      fontWeight: 'bold',
    },
    'hljs-section': {
      color: gruvboxColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-link': {
      color: orange,
    },
    'hljs-function .hljs-keyword': {
      color: gruvboxColors.AccentPurple,
    },
    'hljs-subst': {
      color: gruvboxColors.Foreground,
    },
    'hljs-string': {
      color: gruvboxColors.AccentGreen,
    },
    'hljs-title': {
      color: gruvboxColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-title.function_': {
      color: gruvboxColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-name': {
      color: gruvboxColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: gruvboxColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-attribute': {
      color: gruvboxColors.AccentBlue,
    },
    'hljs-attr': {
      color: orange,
    },
    'hljs-symbol': {
      color: orange,
    },
    'hljs-bullet': {
      color: gruvboxColors.AccentRed,
    },
    'hljs-addition': {
      color: gruvboxColors.AccentGreen,
    },
    'hljs-variable': {
      color: gruvboxColors.AccentRed,
    },
    'hljs-template-tag': {
      color: gruvboxColors.AccentCyan,
    },
    'hljs-template-variable': {
      color: gruvboxColors.AccentRed,
    },
    'hljs-comment': {
      color: gruvboxColors.Comment,
    },
    'hljs-quote': {
      color: gruvboxColors.AccentCyan,
    },
    'hljs-deletion': {
      color: gruvboxColors.AccentRed,
    },
    'hljs-meta': {
      color: neutral_orange,
    },
    'hljs-built_in': {
      color: gruvboxColors.AccentCyan,
    },
    'hljs-regexp': {
      color: gruvboxColors.AccentCyan,
    },
    'hljs-number': {
      color: orange,
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
  gruvboxColors,
);
