/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { darkSemanticColors } from './semantic-tokens.js';

const tokyonightColors: ColorsTheme = {
  type: 'dark',
  Background: '#1a1b26',
  Foreground: '#a9b1d6',
  LightBlue: '#89ddff',
  AccentBlue: '#7aa2f7',
  AccentPurple: '#bb9af7',
  AccentCyan: '#7dcfff',
  AccentGreen: '#73daca',
  AccentYellow: '#e0af68',
  AccentRed: '#f7768e',
  DiffAdded: '#283B4D',
  DiffRemoved: '#3C2C3C',
  Comment: '#565f89',
  Gray: '#9aa5ce',
  GradientColors: ['#7aa2f7', '#bb9af7'],
};

export const TokyoNight: Theme = new Theme(
  'Tokyo Night',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      color: tokyonightColors.Foreground,
      background: tokyonightColors.Background,
    },
    'hljs-comment': {
      color: tokyonightColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: tokyonightColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-keyword': {
      color: tokyonightColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: tokyonightColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-subst': {
      color: tokyonightColors.Foreground,
    },
    'hljs-number': {
      color: tokyonightColors.AccentYellow,
    },
    'hljs-literal': {
      color: tokyonightColors.AccentYellow,
    },
    'hljs-variable': {
      color: tokyonightColors.Foreground,
    },
    'hljs-template-variable': {
      color: tokyonightColors.Foreground,
    },
    'hljs-tag .hljs-attr': {
      color: tokyonightColors.AccentCyan,
    },
    'hljs-string': {
      color: tokyonightColors.AccentGreen,
    },
    'hljs-doctag': {
      color: tokyonightColors.AccentGreen,
    },
    'hljs-title': {
      color: tokyonightColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-section': {
      color: tokyonightColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-selector-id': {
      color: tokyonightColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: tokyonightColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-class .hljs-title': {
      color: tokyonightColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-tag': {
      color: tokyonightColors.LightBlue,
    },
    'hljs-name': {
      color: tokyonightColors.LightBlue,
    },
    'hljs-attribute': {
      color: tokyonightColors.AccentCyan,
    },
    'hljs-regexp': {
      color: tokyonightColors.AccentCyan,
    },
    'hljs-link': {
      color: tokyonightColors.AccentCyan,
    },
    'hljs-symbol': {
      color: tokyonightColors.AccentYellow,
    },
    'hljs-bullet': {
      color: tokyonightColors.AccentYellow,
    },
    'hljs-built_in': {
      color: tokyonightColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: tokyonightColors.LightBlue,
    },
    'hljs-meta': {
      color: tokyonightColors.Gray,
      fontWeight: 'bold',
    },
    'hljs-deletion': {
      background: tokyonightColors.DiffRemoved,
    },
    'hljs-addition': {
      background: tokyonightColors.DiffAdded,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
  },
  tokyonightColors,
  darkSemanticColors,
);
