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
  Comment: '#a2e2be88',
  Gray: '#a2e2be88',
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
      color: '#ff6b70',
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: '#feffde',
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: '#fff2a8',
      fontWeight: 'bold',
    },
    'hljs-section': {
      color: '#ff6b70',
      fontWeight: 'bold',
    },
    'hljs-link': {
      color: '#feffde',
    },
    'hljs-function .hljs-keyword': {
      color: '#8ab9ff',
    },
    'hljs-subst': {
      color: monenokeColors.Foreground,
    },
    'hljs-string': {
      color: '#adffc2',
    },
    'hljs-title': {
      color: '#8ab9ff',
      fontWeight: 'bold',
    },
    'hljs-name': {
      color: '#feffde',
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: '#ff6b70',
      fontWeight: 'bold',
    },
    'hljs-attribute': {
      color: '#8ab9ff',
    },
    'hljs-symbol': {
      color: '#adffc2',
    },
    'hljs-bullet': {
      color: '#ff6b70',
    },
    'hljs-addition': {
      color: monenokeColors.AccentGreen,
    },
    'hljs-variable': {
      color: '#feffde',
    },
    'hljs-template-tag': {
      color: '#ff6b70',
    },
    'hljs-template-variable': {
      color: '#ff6b70',
    },
    'hljs-comment': {
      color: '#a2e2be88',
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: '#c0c0c0',
    },
    'hljs-deletion': {
      color: monenokeColors.AccentRed,
    },
    'hljs-meta': {
      color: '#a2e2be88',
    },
    'hljs-doctag': {
      fontWeight: 'bold',
    },
    'hljs-strong': {
      fontWeight: 'bold',
      color: '#feffde',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
      color: '#feffde',
    },
    'hljs-number': {
      color: '#adffc2',
    },
    'hljs-params': {
      color: '#fff2a8',
    },
    'hljs-function': {
      color: '#8ab9ff',
    },
    'hljs-storage': {
      color: '#ff6b70',
    },
    'hljs-built_in': {
      color: '#feffde',
      fontStyle: 'italic',
    },
    'hljs-class': {
      color: '#fff2a8',
    },
    'hljs-property': {
      color: '#fff2a8',
    },
    'hljs-method': {
      color: '#fff2a8',
    },
    'hljs-title.function': {
      color: '#8ab9ff',
    },
    'hljs-punctuation': {
      color: '#ff6b70',
    },
    'hljs-attr': {
      color: '#8ab9ff',
    },
    'hljs-selector-class': {
      color: '#ff6b70',
    },
    'hljs-selector-id': {
      color: '#adffc2',
    },
    'hljs-tag': {
      color: '#ff6b70',
    },
    'hljs-code': {
      color: '#adffc2',
    },
    'hljs-strong.hljs-emphasis': {
      color: '#feffde',
      fontStyle: 'italic bold',
    },
    'hljs-namespace': {
      color: '#efefef',
    },
  },
  monenokeColors,
);
