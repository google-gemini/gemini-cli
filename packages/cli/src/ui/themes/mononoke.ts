/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';

const mononokeColors: ColorsTheme = {
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

export const Mononoke: Theme = new Theme(
  'Mononoke',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: mononokeColors.Background,
      color: mononokeColors.Foreground,
    },
    'hljs-keyword': {
      color: mononokeColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: mononokeColors.Foreground,
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: mononokeColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-section': {
      color: mononokeColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-link': {
      color: mononokeColors.Foreground,
    },
    'hljs-function .hljs-keyword': {
      color: mononokeColors.AccentBlue,
    },
    'hljs-subst': {
      color: mononokeColors.Foreground,
    },
    'hljs-string': {
      color: mononokeColors.AccentGreen,
    },
    'hljs-title': {
      color: mononokeColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-name': {
      color: mononokeColors.Foreground,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: mononokeColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-attribute': {
      color: mononokeColors.AccentBlue,
    },
    'hljs-symbol': {
      color: mononokeColors.AccentGreen,
    },
    'hljs-bullet': {
      color: mononokeColors.AccentRed,
    },
    'hljs-addition': {
      color: mononokeColors.AccentGreen,
    },
    'hljs-variable': {
      color: mononokeColors.Foreground,
    },
    'hljs-template-tag': {
      color: mononokeColors.AccentRed,
    },
    'hljs-template-variable': {
      color: mononokeColors.AccentRed,
    },
    'hljs-comment': {
      color: mononokeColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: mononokeColors.Gray,
    },
    'hljs-deletion': {
      color: mononokeColors.AccentRed,
    },
    'hljs-meta': {
      color: mononokeColors.Comment,
    },
    'hljs-doctag': {
      fontWeight: 'bold',
    },
    'hljs-strong': {
      fontWeight: 'bold',
      color: mononokeColors.Foreground,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
      color: mononokeColors.Foreground,
    },
    'hljs-number': {
      color: mononokeColors.AccentGreen,
    },
    'hljs-params': {
      color: mononokeColors.AccentYellow,
    },
    'hljs-function': {
      color: mononokeColors.AccentBlue,
    },
    'hljs-storage': {
      color: mononokeColors.AccentRed,
    },
    'hljs-built_in': {
      color: mononokeColors.Foreground,
      fontStyle: 'italic',
    },
    'hljs-class': {
      color: mononokeColors.AccentYellow,
    },
    'hljs-property': {
      color: mononokeColors.AccentYellow,
    },
    'hljs-method': {
      color: mononokeColors.AccentYellow,
    },
    'hljs-title.function': {
      color: mononokeColors.AccentBlue,
    },
    'hljs-punctuation': {
      color: mononokeColors.AccentRed,
    },
    'hljs-attr': {
      color: mononokeColors.AccentBlue,
    },
    'hljs-selector-class': {
      color: mononokeColors.AccentRed,
    },
    'hljs-selector-id': {
      color: mononokeColors.AccentGreen,
    },
    'hljs-tag': {
      color: mononokeColors.AccentRed,
    },
    'hljs-code': {
      color: mononokeColors.AccentGreen,
    },
    'hljs-strong.hljs-emphasis': {
      color: mononokeColors.Foreground,
      fontStyle: 'italic',
      fontWeight: 'bold',
    },
    'hljs-namespace': {
      color: mononokeColors.Foreground,
    },
  },
  mononokeColors,
);
