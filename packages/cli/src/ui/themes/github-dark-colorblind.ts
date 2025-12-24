/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { interpolateColor } from './color-utils.js';

const githubDarkColorblindColors: ColorsTheme = {
  type: 'dark',
  Background: '#0d1117',
  Foreground: '#e6edf3',
  LightBlue: '#a5d6ff',
  AccentBlue: '#79c0ff',
  AccentPurple: '#d2a8ff',
  AccentCyan: '#a5d6ff',
  AccentGreen: '#a5d6ff',
  AccentYellow: '#d29922',
  AccentRed: '#f0883e',
  DiffAdded: '#0d161f',
  DiffRemoved: '#1d150e',
  Comment: '#7d8590',
  Gray: '#7d8590',
  DarkGray: interpolateColor('#7d8590', '#0d1117', 0.5),
  GradientColors: ['#58a6ff', '#f0883e'],
};

export const GitHubDarkColorblind: Theme = new Theme(
  'GitHub Dark Colorblind',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      color: githubDarkColorblindColors.Foreground,
      background: githubDarkColorblindColors.Background,
    },
    'hljs-comment': {
      color: githubDarkColorblindColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: githubDarkColorblindColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-keyword': {
      color: githubDarkColorblindColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: githubDarkColorblindColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-subst': {
      color: githubDarkColorblindColors.Foreground,
    },
    'hljs-number': {
      color: githubDarkColorblindColors.LightBlue,
    },
    'hljs-literal': {
      color: githubDarkColorblindColors.LightBlue,
    },
    'hljs-variable': {
      color: githubDarkColorblindColors.Foreground,
    },
    'hljs-template-variable': {
      color: githubDarkColorblindColors.Foreground,
    },
    'hljs-tag .hljs-attr': {
      color: githubDarkColorblindColors.AccentYellow,
    },
    'hljs-string': {
      color: githubDarkColorblindColors.AccentCyan,
    },
    'hljs-doctag': {
      color: githubDarkColorblindColors.AccentCyan,
    },
    'hljs-title': {
      color: githubDarkColorblindColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-section': {
      color: githubDarkColorblindColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-selector-id': {
      color: githubDarkColorblindColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: githubDarkColorblindColors.AccentGreen,
      fontWeight: 'bold',
    },
    'hljs-class .hljs-title': {
      color: githubDarkColorblindColors.AccentGreen,
      fontWeight: 'bold',
    },
    'hljs-tag': {
      color: githubDarkColorblindColors.AccentGreen,
    },
    'hljs-name': {
      color: githubDarkColorblindColors.AccentGreen,
    },
    'hljs-attribute': {
      color: githubDarkColorblindColors.LightBlue,
    },
    'hljs-regexp': {
      color: githubDarkColorblindColors.AccentCyan,
    },
    'hljs-link': {
      color: githubDarkColorblindColors.AccentCyan,
    },
    'hljs-symbol': {
      color: githubDarkColorblindColors.AccentPurple,
    },
    'hljs-bullet': {
      color: githubDarkColorblindColors.AccentPurple,
    },
    'hljs-built_in': {
      color: githubDarkColorblindColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: githubDarkColorblindColors.LightBlue,
    },
    'hljs-meta': {
      color: githubDarkColorblindColors.LightBlue,
      fontWeight: 'bold',
    },
    'hljs-deletion': {
      background: '#682d0f',
      color: githubDarkColorblindColors.AccentRed,
    },
    'hljs-addition': {
      background: '#0c2d6b',
      color: githubDarkColorblindColors.AccentGreen,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
  },
  githubDarkColorblindColors,
);
