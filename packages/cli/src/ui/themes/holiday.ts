/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { interpolateColor } from './color-utils.js';

const holidayColors: ColorsTheme = {
  type: 'dark',
  Background: '#00210e',
  Foreground: '#F0F8FF',
  LightBlue: '#B0E0E6',
  AccentBlue: '#3CB371',
  AccentPurple: '#FF9999',
  AccentCyan: '#33F9FF',
  AccentGreen: '#3CB371',
  AccentYellow: '#FFEE8C',
  AccentRed: '#FF6347',
  DiffAdded: '#2E8B57',
  DiffRemoved: '#CD5C5C',
  Comment: '#8FBC8F',
  Gray: '#D7F5D3',
  DarkGray: interpolateColor('#D7F5D3', '#151B18', 0.5),
  GradientColors: ['#FF0000', '#FFFFFF', '#008000'],
};

export const Holiday: Theme = new Theme(
  'Holiday',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: holidayColors.Background,
      color: holidayColors.Foreground,
    },
    'hljs-keyword': {
      color: holidayColors.AccentBlue,
    },
    'hljs-literal': {
      color: holidayColors.AccentBlue,
    },
    'hljs-symbol': {
      color: holidayColors.AccentBlue,
    },
    'hljs-name': {
      color: holidayColors.AccentBlue,
    },
    'hljs-link': {
      color: holidayColors.AccentBlue,
      textDecoration: 'underline',
    },
    'hljs-built_in': {
      color: holidayColors.AccentCyan,
    },
    'hljs-type': {
      color: holidayColors.AccentCyan,
    },
    'hljs-number': {
      color: holidayColors.AccentGreen,
    },
    'hljs-class': {
      color: holidayColors.AccentGreen,
    },
    'hljs-string': {
      color: holidayColors.AccentYellow,
    },
    'hljs-meta-string': {
      color: holidayColors.AccentYellow,
    },
    'hljs-regexp': {
      color: holidayColors.AccentRed,
    },
    'hljs-template-tag': {
      color: holidayColors.AccentRed,
    },
    'hljs-subst': {
      color: holidayColors.Foreground,
    },
    'hljs-function': {
      color: holidayColors.Foreground,
    },
    'hljs-title': {
      color: holidayColors.Foreground,
    },
    'hljs-params': {
      color: holidayColors.Foreground,
    },
    'hljs-formula': {
      color: holidayColors.Foreground,
    },
    'hljs-comment': {
      color: holidayColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: holidayColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-doctag': {
      color: holidayColors.Comment,
    },
    'hljs-meta': {
      color: holidayColors.Gray,
    },
    'hljs-meta-keyword': {
      color: holidayColors.Gray,
    },
    'hljs-tag': {
      color: holidayColors.Gray,
    },
    'hljs-variable': {
      color: holidayColors.AccentPurple,
    },
    'hljs-template-variable': {
      color: holidayColors.AccentPurple,
    },
    'hljs-attr': {
      color: holidayColors.LightBlue,
    },
    'hljs-attribute': {
      color: holidayColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: holidayColors.LightBlue,
    },
    'hljs-section': {
      color: holidayColors.AccentYellow,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-bullet': {
      color: holidayColors.AccentYellow,
    },
    'hljs-selector-tag': {
      color: holidayColors.AccentYellow,
    },
    'hljs-selector-id': {
      color: holidayColors.AccentYellow,
    },
    'hljs-selector-class': {
      color: holidayColors.AccentYellow,
    },
    'hljs-selector-attr': {
      color: holidayColors.AccentYellow,
    },
    'hljs-selector-pseudo': {
      color: holidayColors.AccentYellow,
    },
    'hljs-addition': {
      backgroundColor: holidayColors.DiffAdded,
      display: 'inline-block',
      width: '100%',
    },
    'hljs-deletion': {
      backgroundColor: holidayColors.DiffRemoved,
      display: 'inline-block',
      width: '100%',
    },
  },
  holidayColors,
);
