/**
 * @license
 * Copyright 2025 Catppuccin
 * SPDX-License-Identifier: MIT
 */

import { type ColorsTheme, Theme } from './theme.js';

const catppuccinMacchiatoColors: ColorsTheme = {
  type: 'dark',
  Background: '#24273a',
  Foreground: '#cad3f5',
  LightBlue: '#7dc4e4',
  AccentBlue: '#8aadf4',
  AccentPurple: '#b7bdf8',
  AccentCyan: '#91d7e3',
  AccentGreen: '#a6da95',
  AccentYellow: '#eed49f',
  AccentRed: '#ed8796',
  Comment: '#b8c0e0',
  Gray: '#6e738d',
  GradientColors: ['#f5bde6', '#8bd5ca'],
};

export const CatppuccinMacchiato: Theme = new Theme(
  'Catppuccin Macchiato',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: catppuccinMacchiatoColors.Background,
      color: catppuccinMacchiatoColors.Foreground,
    },
    'hljs-keyword': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-literal': {
      color: catppuccinMacchiatoColors.AccentPurple,
    },
    'hljs-symbol': {
      color: catppuccinMacchiatoColors.AccentCyan,
    },
    'hljs-name': {
      color: catppuccinMacchiatoColors.LightBlue,
    },
    'hljs-link': {
      color: catppuccinMacchiatoColors.AccentBlue,
    },
    'hljs-function .hljs-keyword': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-subst': {
      color: catppuccinMacchiatoColors.Foreground,
    },
    'hljs-string': {
      color: catppuccinMacchiatoColors.AccentGreen,
    },
    'hljs-title': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-type': {
      color: catppuccinMacchiatoColors.AccentBlue,
    },
    'hljs-attribute': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-bullet': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-addition': {
      color: catppuccinMacchiatoColors.AccentGreen,
    },
    'hljs-variable': {
      color: catppuccinMacchiatoColors.Foreground,
    },
    'hljs-template-tag': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-comment': {
      color: catppuccinMacchiatoColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: catppuccinMacchiatoColors.AccentCyan,
      fontStyle: 'italic',
    },
    'hljs-deletion': {
      color: catppuccinMacchiatoColors.AccentRed,
    },
    'hljs-meta': {
      color: catppuccinMacchiatoColors.AccentYellow,
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
  catppuccinMacchiatoColors,
);
