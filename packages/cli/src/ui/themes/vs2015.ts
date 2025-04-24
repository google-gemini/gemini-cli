/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { darkTheme, Theme } from './theme.js';

export const VS2015: Theme = new Theme(
  'VS2015',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: '#1E1E1E',
      color: '#DCDCDC',
    },
    'hljs-keyword': {
      color: '#569CD6',
    },
    'hljs-literal': {
      color: '#569CD6',
    },
    'hljs-symbol': {
      color: '#569CD6',
    },
    'hljs-name': {
      color: '#569CD6',
    },
    'hljs-link': {
      color: '#569CD6',
      textDecoration: 'underline',
    },
    'hljs-built_in': {
      color: '#4EC9B0',
    },
    'hljs-type': {
      color: '#4EC9B0',
    },
    'hljs-number': {
      color: '#B8D7A3',
    },
    'hljs-class': {
      color: '#B8D7A3',
    },
    'hljs-string': {
      color: '#D69D85',
    },
    'hljs-meta-string': {
      color: '#D69D85',
    },
    'hljs-regexp': {
      color: '#9A5334',
    },
    'hljs-template-tag': {
      color: '#9A5334',
    },
    'hljs-subst': {
      color: '#DCDCDC',
    },
    'hljs-function': {
      color: '#DCDCDC',
    },
    'hljs-title': {
      color: '#DCDCDC',
    },
    'hljs-params': {
      color: '#DCDCDC',
    },
    'hljs-formula': {
      color: '#DCDCDC',
    },
    'hljs-comment': {
      color: '#57A64A',
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: '#57A64A',
      fontStyle: 'italic',
    },
    'hljs-doctag': {
      color: '#608B4E',
    },
    'hljs-meta': {
      color: '#9B9B9B',
    },
    'hljs-meta-keyword': {
      color: '#9B9B9B',
    },
    'hljs-tag': {
      color: '#9B9B9B',
    },
    'hljs-variable': {
      color: '#BD63C5',
    },
    'hljs-template-variable': {
      color: '#BD63C5',
    },
    'hljs-attr': {
      color: '#9CDCFE',
    },
    'hljs-attribute': {
      color: '#9CDCFE',
    },
    'hljs-builtin-name': {
      color: '#9CDCFE',
    },
    'hljs-section': {
      color: 'gold',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-bullet': {
      color: '#D7BA7D',
    },
    'hljs-selector-tag': {
      color: '#D7BA7D',
    },
    'hljs-selector-id': {
      color: '#D7BA7D',
    },
    'hljs-selector-class': {
      color: '#D7BA7D',
    },
    'hljs-selector-attr': {
      color: '#D7BA7D',
    },
    'hljs-selector-pseudo': {
      color: '#D7BA7D',
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
  darkTheme,
);
