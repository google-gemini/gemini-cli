/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { lightSemanticColors } from './semantic-tokens.js';

const xcodeColors: ColorsTheme = {
  type: 'light',
  Background: '#fff',
  Foreground: '#444',
  LightBlue: '#0E0EFF',
  AccentBlue: '#1c00cf',
  AccentPurple: '#aa0d91',
  AccentCyan: '#3F6E74',
  AccentGreen: '#007400',
  AccentYellow: '#836C28',
  AccentRed: '#c41a16',
  DiffAdded: '#C6EAD8',
  DiffRemoved: '#FEDEDE',
  Comment: '#007400',
  Gray: '#c0c0c0',
  GradientColors: ['#1c00cf', '#007400'],
};

export const XCode: Theme = new Theme(
  'Xcode',
  'light',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: xcodeColors.Background,
      color: xcodeColors.Foreground,
    },
    'xml .hljs-meta': {
      color: xcodeColors.Gray,
    },
    'hljs-comment': {
      color: xcodeColors.Comment,
    },
    'hljs-quote': {
      color: xcodeColors.Comment,
    },
    'hljs-tag': {
      color: xcodeColors.AccentPurple,
    },
    'hljs-attribute': {
      color: xcodeColors.AccentPurple,
    },
    'hljs-keyword': {
      color: xcodeColors.AccentPurple,
    },
    'hljs-selector-tag': {
      color: xcodeColors.AccentPurple,
    },
    'hljs-literal': {
      color: xcodeColors.AccentPurple,
    },
    'hljs-name': {
      color: xcodeColors.AccentPurple,
    },
    'hljs-variable': {
      color: xcodeColors.AccentCyan,
    },
    'hljs-template-variable': {
      color: xcodeColors.AccentCyan,
    },
    'hljs-code': {
      color: xcodeColors.AccentRed,
    },
    'hljs-string': {
      color: xcodeColors.AccentRed,
    },
    'hljs-meta-string': {
      color: xcodeColors.AccentRed,
    },
    'hljs-regexp': {
      color: xcodeColors.LightBlue,
    },
    'hljs-link': {
      color: xcodeColors.LightBlue,
    },
    'hljs-title': {
      color: xcodeColors.AccentBlue,
    },
    'hljs-symbol': {
      color: xcodeColors.AccentBlue,
    },
    'hljs-bullet': {
      color: xcodeColors.AccentBlue,
    },
    'hljs-number': {
      color: xcodeColors.AccentBlue,
    },
    'hljs-section': {
      color: xcodeColors.AccentYellow,
    },
    'hljs-meta': {
      color: xcodeColors.AccentYellow,
    },
    'hljs-class .hljs-title': {
      color: xcodeColors.AccentPurple,
    },
    'hljs-type': {
      color: xcodeColors.AccentPurple,
    },
    'hljs-built_in': {
      color: xcodeColors.AccentPurple,
    },
    'hljs-builtin-name': {
      color: xcodeColors.AccentPurple,
    },
    'hljs-params': {
      color: xcodeColors.AccentPurple,
    },
    'hljs-attr': {
      color: xcodeColors.AccentYellow,
    },
    'hljs-subst': {
      color: xcodeColors.Foreground,
    },
    'hljs-formula': {
      backgroundColor: '#eee',
      fontStyle: 'italic',
    },
    'hljs-addition': {
      backgroundColor: '#baeeba',
    },
    'hljs-deletion': {
      backgroundColor: '#ffc8bd',
    },
    'hljs-selector-id': {
      color: xcodeColors.AccentYellow,
    },
    'hljs-selector-class': {
      color: xcodeColors.AccentYellow,
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
  xcodeColors,
  lightSemanticColors,
);
