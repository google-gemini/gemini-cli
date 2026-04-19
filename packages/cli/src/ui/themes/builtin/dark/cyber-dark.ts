/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from '../../theme.js';
import { interpolateColor } from '../../color-utils.js';

const cyberColors: ColorsTheme = {
  type: 'dark',
  Background: '#0a0a0a',
  Foreground: '#00FF41',
  LightBlue: '#00CC33',
  AccentBlue: '#00FF41',
  AccentPurple: '#00FF88',
  AccentCyan: '#00DD55',
  AccentGreen: '#00FF00',
  AccentYellow: '#33FF33',
  AccentRed: '#FF0040',
  DiffAdded: '#003300',
  DiffRemoved: '#330000',
  Comment: '#006600',
  Gray: '#008800',
  DarkGray: interpolateColor('#008800', '#0a0a0a', 0.5),
  GradientColors: ['#00FF00', '#00FF88', '#00FFCC'],
};

export const Cyber: Theme = new Theme(
  'Cyber',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: cyberColors.Background,
      color: cyberColors.Foreground,
    },
    'hljs-keyword': {
      color: cyberColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: cyberColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: cyberColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-section': {
      color: cyberColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-link': {
      color: cyberColors.AccentCyan,
    },
    'hljs-function .hljs-keyword': {
      color: cyberColors.AccentPurple,
    },
    'hljs-subst': {
      color: cyberColors.Foreground,
    },
    'hljs-string': {
      color: cyberColors.AccentYellow,
    },
    'hljs-title': {
      color: cyberColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-name': {
      color: cyberColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: cyberColors.AccentCyan,
      fontWeight: 'bold',
    },
    'hljs-attribute': {
      color: cyberColors.AccentYellow,
    },
    'hljs-symbol': {
      color: cyberColors.AccentYellow,
    },
    'hljs-bullet': {
      color: cyberColors.AccentYellow,
    },
    'hljs-addition': {
      color: cyberColors.AccentGreen,
    },
    'hljs-variable': {
      color: cyberColors.AccentPurple,
    },
    'hljs-template-tag': {
      color: cyberColors.AccentCyan,
    },
    'hljs-template-variable': {
      color: cyberColors.AccentPurple,
    },
    'hljs-comment': {
      color: cyberColors.Comment,
    },
    'hljs-quote': {
      color: cyberColors.Comment,
    },
    'hljs-deletion': {
      color: cyberColors.AccentRed,
    },
    'hljs-meta': {
      color: cyberColors.Comment,
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
  cyberColors,
);
