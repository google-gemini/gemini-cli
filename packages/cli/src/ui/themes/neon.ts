/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';

const neonColors: ColorsTheme = {
  type: 'dark',
  Foreground: '#00FFFF', // Cyan
  Background: '#000000', // Black
  LightBlue: '#00BFFF', // Deep Sky Blue
  AccentBlue: '#0000FF', // Blue
  AccentPurple: '#FF00FF', // Magenta
  AccentCyan: '#00FFFF', // Cyan
  AccentGreen: '#00FF00', // Lime Green
  AccentYellow: '#FFFF00', // Yellow
  AccentRed: '#FF0000', // Red
  Comment: '#808080', // Gray for comments
  Gray: '#808080', // Gray
  GradientColors: ['#00FFFF', '#FF00FF', '#FFFF00', '#00FF00'],
};

export const neon: Theme = new Theme(
  'neon',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: neonColors.Background,
      color: neonColors.Foreground,
    },
    'xml .hljs-meta': {
      color: neonColors.Gray,
    },
    'hljs-comment': {
      color: neonColors.Comment,
    },
    'hljs-quote': {
      color: neonColors.Comment,
    },
    'hljs-tag': {
      color: neonColors.AccentPurple,
    },
    'hljs-attribute': {
      color: neonColors.AccentPurple,
    },
    'hljs-keyword': {
      color: neonColors.AccentPurple,
    },
    'hljs-selector-tag': {
      color: neonColors.AccentPurple,
    },
    'hljs-literal': {
      color: neonColors.AccentPurple,
    },
    'hljs-name': {
      color: neonColors.AccentPurple,
    },
    'hljs-variable': {
      color: neonColors.AccentCyan,
    },
    'hljs-template-variable': {
      color: neonColors.AccentCyan,
    },
    'hljs-code': {
      color: neonColors.AccentRed,
    },
    'hljs-string': {
      color: neonColors.AccentRed,
    },
    'hljs-meta-string': {
      color: neonColors.AccentRed,
    },
    'hljs-regexp': {
      color: neonColors.LightBlue,
    },
    'hljs-link': {
      color: neonColors.LightBlue,
    },
    'hljs-title': {
      color: neonColors.AccentBlue,
    },
    'hljs-symbol': {
      color: neonColors.AccentBlue,
    },
    'hljs-bullet': {
      color: neonColors.AccentBlue,
    },
    'hljs-number': {
      color: neonColors.AccentBlue,
    },
    'hljs-section': {
      color: neonColors.AccentYellow,
    },
    'hljs-meta': {
      color: neonColors.AccentYellow,
    },
    'hljs-class .hljs-title': {
      color: neonColors.AccentPurple,
    },
    'hljs-type': {
      color: neonColors.AccentPurple,
    },
    'hljs-built_in': {
      color: neonColors.AccentPurple,
    },
    'hljs-builtin-name': {
      color: neonColors.AccentPurple,
    },
    'hljs-params': {
      color: neonColors.AccentPurple,
    },
    'hljs-attr': {
      color: neonColors.AccentYellow,
    },
    'hljs-subst': {
      color: neonColors.Foreground,
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
      color: neonColors.AccentYellow,
    },
    'hljs-selector-class': {
      color: neonColors.AccentYellow,
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
  neonColors,
);