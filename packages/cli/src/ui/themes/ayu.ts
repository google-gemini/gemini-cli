/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { darkTheme, Theme } from './theme.js';

export const AyuDark: Theme = new Theme(
  'Ayu',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: '#0b0e14',
      color: '#bfbdb6',
    },
    'hljs-keyword': {
      color: '#FF8F40',
    },
    'hljs-literal': {
      color: '#D2A6FF',
    },
    'hljs-symbol': {
      color: '#95E6CB',
    },
    'hljs-name': {
      color: '#59C2FF',
    },
    'hljs-link': {
      color: '#39BAE6',
    },
    'hljs-function .hljs-keyword': {
      color: '#FFB454',
    },
    'hljs-subst': {
      color: '#BFBDB6',
    },
    'hljs-string': {
      color: '#AAD94C',
    },
    'hljs-title': {
      color: '#FFB454',
    },
    'hljs-type': {
      color: '#39BAE6',
    },
    'hljs-attribute': {
      color: '#FFB454',
    },
    'hljs-bullet': {
      color: '#FFB454',
    },
    'hljs-addition': {
      color: '#7FD962',
    },
    'hljs-variable': {
      color: '#BFBDB6',
    },
    'hljs-template-tag': {
      color: '#FF8F40',
    },
    'hljs-template-variable': {
      color: '#FF8F40',
    },
    'hljs-comment': {
      color: '#ACB6BF8C',
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: '#95E6CB',
      fontStyle: 'italic',
    },
    'hljs-deletion': {
      color: '#F26D78',
    },
    'hljs-meta': {
      color: '#E6B673',
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
  darkTheme,
);
