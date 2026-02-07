/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { interpolateColor } from './color-utils.js';

const githubLightColorblindColors: ColorsTheme = {
  type: 'light',
  Background: '#ffffff',
  Foreground: '#1f2328',
  LightBlue: '#0a3069',
  AccentBlue: '#0550ae',
  AccentPurple: '#8250df',
  AccentCyan: '#0a3069',
  AccentGreen: '#0969da',
  AccentYellow: '#9a6700',
  AccentRed: '#bc4c00',
  DiffAdded: '#ddf4ff',
  DiffRemoved: '#fff1e5',
  Comment: '#656d76',
  Gray: '#656d76',
  DarkGray: interpolateColor('#656d76', '#ffffff', 0.5),
  GradientColors: ['#0969da', '#bc4c00'],
};

export const GitHubLightColorblind: Theme = new Theme(
  'GitHub Light Colorblind',
  'light',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      color: githubLightColorblindColors.Foreground,
      background: githubLightColorblindColors.Background,
    },
    'hljs-comment': {
      color: githubLightColorblindColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: githubLightColorblindColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-keyword': {
      color: githubLightColorblindColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: githubLightColorblindColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-subst': {
      color: githubLightColorblindColors.Foreground,
    },
    'hljs-number': {
      color: githubLightColorblindColors.LightBlue,
    },
    'hljs-literal': {
      color: githubLightColorblindColors.LightBlue,
    },
    'hljs-variable': {
      color: githubLightColorblindColors.Foreground,
    },
    'hljs-template-variable': {
      color: githubLightColorblindColors.Foreground,
    },
    'hljs-tag .hljs-attr': {
      color: githubLightColorblindColors.AccentYellow,
    },
    'hljs-string': {
      color: githubLightColorblindColors.AccentCyan,
    },
    'hljs-doctag': {
      color: githubLightColorblindColors.AccentCyan,
    },
    'hljs-title': {
      color: githubLightColorblindColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-section': {
      color: githubLightColorblindColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-selector-id': {
      color: githubLightColorblindColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: githubLightColorblindColors.AccentGreen,
      fontWeight: 'bold',
    },
    'hljs-class .hljs-title': {
      color: githubLightColorblindColors.AccentGreen,
      fontWeight: 'bold',
    },
    'hljs-tag': {
      color: githubLightColorblindColors.AccentGreen,
    },
    'hljs-name': {
      color: githubLightColorblindColors.AccentGreen,
    },
    'hljs-attribute': {
      color: githubLightColorblindColors.LightBlue,
    },
    'hljs-regexp': {
      color: githubLightColorblindColors.AccentCyan,
    },
    'hljs-link': {
      color: githubLightColorblindColors.AccentCyan,
    },
    'hljs-symbol': {
      color: githubLightColorblindColors.AccentPurple,
    },
    'hljs-bullet': {
      color: githubLightColorblindColors.AccentPurple,
    },
    'hljs-built_in': {
      color: githubLightColorblindColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: githubLightColorblindColors.LightBlue,
    },
    'hljs-meta': {
      color: githubLightColorblindColors.LightBlue,
      fontWeight: 'bold',
    },
    'hljs-deletion': {
      background: '#fff1e5',
      color: githubLightColorblindColors.AccentRed,
    },
    'hljs-addition': {
      background: '#ddf4ff',
      color: githubLightColorblindColors.AccentGreen,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
  },
  githubLightColorblindColors,
);
