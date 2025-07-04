/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';

const monenokeColors: ColorsTheme = {
  type: 'dark',
  Background: '#1f4240',
  Foreground: '#eeffe1',
  LightBlue: '#36a3d9',
  AccentBlue: '#36a3d9',
  AccentPurple: '#d4bfff',
  AccentCyan: '#86f3f3',
  AccentGreen: '#d8eb9a',
  AccentYellow: '#ffd580',
  AccentRed: '#ffc44c',
  Comment: '#a2e2be',
  Gray: '#a2e2be',
  GradientColors: ['#ffd580', '#8ab9ff'],
};

export const Monenoke: Theme = new Theme(
  'Monenoke',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: monenokeColors.Background,
      color: monenokeColors.Foreground,
    },
    'hljs-keyword': {
      color: monenokeColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: monenokeColors.Foreground,
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: monenokeColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-section': {
      color: monenokeColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-link': {
      color: monenokeColors.Foreground,
    },
    'hljs-function .hljs-keyword': {
      color: monenokeColors.AccentBlue,
    },
    'hljs-subst': {
      color: monenokeColors.Foreground,
    },
    'hljs-string': {
      color: monenokeColors.AccentGreen,
    },
    'hljs-title': {
      color: monenokeColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-name': {
      color: monenokeColors.Foreground,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: monenokeColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-attribute': {
      color: monenokeColors.AccentBlue,
    },
    'hljs-symbol': {
      color: monenokeColors.AccentGreen,
    },
    'hljs-bullet': {
      color: monenokeColors.AccentRed,
    },
    'hljs-addition': {
      color: monenokeColors.AccentGreen,
    },
    'hljs-variable': {
      color: monenokeColors.Foreground,
    },
    'hljs-template-tag': {
      color: monenokeColors.AccentRed,
    },
    'hljs-template-variable': {
      color: monenokeColors.AccentRed,
    },
    'hljs-comment': {
      color: '#a2e2be',
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: monenokeColors.Gray,
    },
    'hljs-deletion': {
      color: monenokeColors.AccentRed,
    },
    'hljs-meta': {
      color: monenokeColors.Comment,
    },
    'hljs-doctag': {
      fontWeight: 'bold',
    },
    'hljs-strong': {
      fontWeight: 'bold',
      color: monenokeColors.Foreground,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
      color: monenokeColors.Foreground,
    },
    'hljs-number': {
      color: monenokeColors.AccentGreen,
    },
    'hljs-params': {
      color: monenokeColors.AccentYellow,
    },
    'hljs-function': {
      color: monenokeColors.AccentBlue,
    },
    'hljs-storage': {
      color: monenokeColors.AccentRed,
    },
    'hljs-built_in': {
      color: monenokeColors.Foreground,
      fontStyle: 'italic',
    },
    'hljs-class': {
      color: monenokeColors.AccentYellow,
    },
    'hljs-property': {
      color: monenokeColors.AccentYellow,
    },
    'hljs-method': {
      color: monenokeColors.AccentYellow,
    },
    'hljs-title.function': {
      color: monenokeColors.AccentBlue,
    },
    'hljs-punctuation': {
      color: monenokeColors.AccentRed,
    },
    'hljs-attr': {
      color: monenokeColors.AccentBlue,
    },
    'hljs-selector-class': {
      color: monenokeColors.AccentRed,
    },
    'hljs-selector-id': {
      color: monenokeColors.AccentGreen,
    },
    'hljs-tag': {
      color: monenokeColors.AccentRed,
    },
    'hljs-code': {
      color: monenokeColors.AccentGreen,
    },
    'hljs-strong.hljs-emphasis': {
      color: monenokeColors.Foreground,
      fontStyle: 'italic',
      fontWeight: 'bold',
    },
    'hljs-namespace': {
      color: monenokeColors.Foreground,
    },
  },
  monenokeColors,
);
