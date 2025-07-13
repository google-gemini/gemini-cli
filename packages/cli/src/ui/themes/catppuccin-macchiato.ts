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
  AccentPurple: '#c6a0f6',
  AccentCyan: '#91d7e3',
  AccentGreen: '#a6da95',
  AccentYellow: '#eed49f',
  AccentRed: '#ed8796',
  Comment: '#939ab7',
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
    'hljs-built_in': {
      color: catppuccinMacchiatoColors.AccentRed,
    },
    'hljs-class': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-keyword': {
      color: catppuccinMacchiatoColors.AccentPurple,
    },
    'hljs-link': {
      color: catppuccinMacchiatoColors.LightBlue,
      textDecoration: 'underline',
    },
    'hljs-literal': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-name': {
      color: catppuccinMacchiatoColors.AccentBlue,
    },
    'hljs-number': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-symbol': {
      color: catppuccinMacchiatoColors.AccentRed,
    },
    'hljs-type': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },

    'hljs-string': {
      color: catppuccinMacchiatoColors.AccentGreen,
    },
    'hljs-meta-string': {
      color: catppuccinMacchiatoColors.AccentGreen,
    },
    'hljs-regexp': {
      color: catppuccinMacchiatoColors.AccentRed,
    },
    'hljs-template-tag': {
      color: catppuccinMacchiatoColors.AccentRed,
    },
    'hljs-subst': {
      color: catppuccinMacchiatoColors.Foreground,
    },
    'hljs-function': {
      color: catppuccinMacchiatoColors.AccentBlue,
    },
    'hljs-title': {
      color: catppuccinMacchiatoColors.Foreground,
    },
    'hljs-params': {
      color: catppuccinMacchiatoColors.Foreground,
    },
    'hljs-formula': {
      color: catppuccinMacchiatoColors.Foreground,
    },
    'hljs-comment': {
      color: catppuccinMacchiatoColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: catppuccinMacchiatoColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-doctag': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-meta': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-meta-keyword': {
      color: catppuccinMacchiatoColors.AccentPurple,
    },
    'hljs-tag': {
      color: catppuccinMacchiatoColors.Gray,
    },
    'hljs-variable': {
      color: catppuccinMacchiatoColors.AccentPurple,
    },
    'hljs-template-variable': {
      color: catppuccinMacchiatoColors.AccentPurple,
    },
    'hljs-attr': {
      color: catppuccinMacchiatoColors.LightBlue,
    },
    'hljs-attribute': {
      color: catppuccinMacchiatoColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: catppuccinMacchiatoColors.LightBlue,
    },
    'hljs-section': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-bullet': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-selector-tag': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-selector-id': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-selector-class': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-selector-attr': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-selector-pseudo': {
      color: catppuccinMacchiatoColors.AccentYellow,
    },
    'hljs-addition': {
      backgroundColor: '#144212',
      display: 'inline-block',
      width: '100%',
    },
    'hljs-deletion': {
      backgroundColor: '#600',
      display: 'inline-block',
      width: '100%',
    },
  },
  catppuccinMacchiatoColors,
);
