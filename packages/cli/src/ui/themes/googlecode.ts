/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { lightTheme, Theme } from './theme.js';

export const GoogleCode: Theme = new Theme(
  'Google Code',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: 'white',
      color: 'black',
    },
    'hljs-comment': {
      color: '#800',
    },
    'hljs-quote': {
      color: '#800',
    },
    'hljs-keyword': {
      color: '#008',
    },
    'hljs-selector-tag': {
      color: '#008',
    },
    'hljs-section': {
      color: '#008',
    },
    'hljs-title': {
      color: '#606',
    },
    'hljs-name': {
      color: '#008',
    },
    'hljs-variable': {
      color: '#660',
    },
    'hljs-template-variable': {
      color: '#660',
    },
    'hljs-string': {
      color: '#080',
    },
    'hljs-selector-attr': {
      color: '#080',
    },
    'hljs-selector-pseudo': {
      color: '#080',
    },
    'hljs-regexp': {
      color: '#080',
    },
    'hljs-literal': {
      color: '#066',
    },
    'hljs-symbol': {
      color: '#066',
    },
    'hljs-bullet': {
      color: '#066',
    },
    'hljs-meta': {
      color: '#066',
    },
    'hljs-number': {
      color: '#066',
    },
    'hljs-link': {
      color: '#066',
    },
    'hljs-doctag': {
      color: '#606',
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: '#606',
    },
    'hljs-attr': {
      color: '#606',
    },
    'hljs-built_in': {
      color: '#606',
    },
    'hljs-builtin-name': {
      color: '#606',
    },
    'hljs-params': {
      color: '#606',
    },
    'hljs-attribute': {
      color: '#000',
    },
    'hljs-subst': {
      color: '#000',
    },
    'hljs-formula': {
      backgroundColor: '#eee',
      fontStyle: 'italic',
    },
    'hljs-selector-id': {
      color: '#9B703F',
    },
    'hljs-selector-class': {
      color: '#9B703F',
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
  lightTheme,
);
