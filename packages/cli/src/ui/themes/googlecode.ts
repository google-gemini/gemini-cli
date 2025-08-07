/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { lightTheme, Theme, type ColorsTheme } from './theme.js';
import { lightSemanticColors } from './semantic-tokens.js';

const googleCodeColors: ColorsTheme = {
  type: 'light',
  Background: 'white',
  Foreground: '#444',
  LightBlue: '#066',
  AccentBlue: '#008',
  AccentPurple: '#606',
  AccentCyan: '#066',
  AccentGreen: '#080',
  AccentYellow: '#660',
  AccentRed: '#800',
  DiffAdded: '#C6EAD8',
  DiffRemoved: '#FEDEDE',
  Comment: '#5f6368',
  Gray: lightTheme.Gray,
  GradientColors: ['#066', '#606'],
};

export const GoogleCode: Theme = new Theme(
  'Google Code',
  'light',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: googleCodeColors.Background,
      color: googleCodeColors.Foreground,
    },
    'hljs-comment': {
      color: googleCodeColors.AccentRed,
    },
    'hljs-quote': {
      color: googleCodeColors.AccentRed,
    },
    'hljs-keyword': {
      color: googleCodeColors.AccentBlue,
    },
    'hljs-selector-tag': {
      color: googleCodeColors.AccentBlue,
    },
    'hljs-section': {
      color: googleCodeColors.AccentBlue,
    },
    'hljs-title': {
      color: googleCodeColors.AccentPurple,
    },
    'hljs-name': {
      color: googleCodeColors.AccentBlue,
    },
    'hljs-variable': {
      color: googleCodeColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: googleCodeColors.AccentYellow,
    },
    'hljs-string': {
      color: googleCodeColors.AccentGreen,
    },
    'hljs-selector-attr': {
      color: googleCodeColors.AccentGreen,
    },
    'hljs-selector-pseudo': {
      color: googleCodeColors.AccentGreen,
    },
    'hljs-regexp': {
      color: googleCodeColors.AccentGreen,
    },
    'hljs-literal': {
      color: googleCodeColors.AccentCyan,
    },
    'hljs-symbol': {
      color: googleCodeColors.AccentCyan,
    },
    'hljs-bullet': {
      color: googleCodeColors.AccentCyan,
    },
    'hljs-meta': {
      color: googleCodeColors.AccentCyan,
    },
    'hljs-number': {
      color: googleCodeColors.AccentCyan,
    },
    'hljs-link': {
      color: googleCodeColors.AccentCyan,
    },
    'hljs-doctag': {
      color: googleCodeColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: googleCodeColors.AccentPurple,
    },
    'hljs-attr': {
      color: googleCodeColors.AccentPurple,
    },
    'hljs-built_in': {
      color: googleCodeColors.AccentPurple,
    },
    'hljs-builtin-name': {
      color: googleCodeColors.AccentPurple,
    },
    'hljs-params': {
      color: googleCodeColors.AccentPurple,
    },
    'hljs-attribute': {
      color: googleCodeColors.Foreground,
    },
    'hljs-subst': {
      color: googleCodeColors.Foreground,
    },
    'hljs-formula': {
      backgroundColor: '#eee',
      fontStyle: 'italic',
    },
    'hljs-selector-id': {
      color: googleCodeColors.AccentYellow,
    },
    'hljs-selector-class': {
      color: googleCodeColors.AccentYellow,
    },
    'hljs-addition': {
      backgroundColor: '#baeeba',
    },
    'hljs-deletion': {
      backgroundColor: '#ffc8bd',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
  },
  googleCodeColors,
  lightSemanticColors,
);
