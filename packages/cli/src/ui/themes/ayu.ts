/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';

const ayuDarkColors: ColorsTheme = {
  type: 'dark',
  Background: '#0b0e14',
  Foreground: '#bfbdb6',
  LightBlue: '#59C2FF',
  AccentBlue: '#39BAE6',
  AccentPurple: '#D2A6FF',
  AccentCyan: '#95E6CB',
  AccentGreen: '#AAD94C',
  AccentYellow: '#FFB454',
  AccentRed: '#F26D78',
  Comment: '#646A71',
  Gray: '##3D4149',
  GradientColors: ['#FFB454', '#F26D78'],
};

export const AyuDark: Theme = new Theme(
  'Ayu',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: ayuDarkColors.Background,
      color: ayuDarkColors.Foreground,
    },
    'hljs-keyword': {
      color: ayuDarkColors.AccentYellow,
    },
    'hljs-literal': {
      color: ayuDarkColors.AccentPurple,
    },
    'hljs-symbol': {
      color: ayuDarkColors.AccentCyan,
    },
    'hljs-name': {
      color: ayuDarkColors.LightBlue,
    },
    'hljs-link': {
      color: ayuDarkColors.AccentBlue,
    },
    'hljs-function .hljs-keyword': {
      color: ayuDarkColors.AccentYellow,
    },
    'hljs-subst': {
      color: ayuDarkColors.Foreground,
    },
    'hljs-string': {
      color: ayuDarkColors.AccentGreen,
    },
    'hljs-title': {
      color: ayuDarkColors.AccentYellow,
    },
    'hljs-type': {
      color: ayuDarkColors.AccentBlue,
    },
    'hljs-attribute': {
      color: ayuDarkColors.AccentYellow,
    },
    'hljs-bullet': {
      color: ayuDarkColors.AccentYellow,
    },
    'hljs-addition': {
      color: ayuDarkColors.AccentGreen,
    },
    'hljs-variable': {
      color: ayuDarkColors.Foreground,
    },
    'hljs-template-tag': {
      color: ayuDarkColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: ayuDarkColors.AccentYellow,
    },
    'hljs-comment': {
      color: ayuDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: ayuDarkColors.AccentCyan,
      fontStyle: 'italic',
    },
    'hljs-deletion': {
      color: ayuDarkColors.AccentRed,
    },
    'hljs-meta': {
      color: ayuDarkColors.AccentYellow,
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
  ayuDarkColors,
);
