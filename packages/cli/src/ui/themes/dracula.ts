/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Theme } from './theme.js';

export const Dracula: Theme = new Theme('Dracula', {
  hljs: {
    display: 'block',
    overflowX: 'auto',
    padding: '0.5em',
    background: '#282a36',
    color: '#f8f8f2',
  },
  'hljs-keyword': {
    color: '#8be9fd',
    fontWeight: 'bold',
  },
  'hljs-selector-tag': {
    color: '#8be9fd',
    fontWeight: 'bold',
  },
  'hljs-literal': {
    color: '#8be9fd',
    fontWeight: 'bold',
  },
  'hljs-section': {
    color: '#8be9fd',
    fontWeight: 'bold',
  },
  'hljs-link': {
    color: '#8be9fd',
  },
  'hljs-function .hljs-keyword': {
    color: '#ff79c6',
  },
  'hljs-subst': {
    color: '#f8f8f2',
  },
  'hljs-string': {
    color: '#f1fa8c',
  },
  'hljs-title': {
    color: '#f1fa8c',
    fontWeight: 'bold',
  },
  'hljs-name': {
    color: '#f1fa8c',
    fontWeight: 'bold',
  },
  'hljs-type': {
    color: '#f1fa8c',
    fontWeight: 'bold',
  },
  'hljs-attribute': {
    color: '#f1fa8c',
  },
  'hljs-symbol': {
    color: '#f1fa8c',
  },
  'hljs-bullet': {
    color: '#f1fa8c',
  },
  'hljs-addition': {
    color: '#f1fa8c',
  },
  'hljs-variable': {
    color: '#f1fa8c',
  },
  'hljs-template-tag': {
    color: '#f1fa8c',
  },
  'hljs-template-variable': {
    color: '#f1fa8c',
  },
  'hljs-comment': {
    color: '#6272a4',
  },
  'hljs-quote': {
    color: '#6272a4',
  },
  'hljs-deletion': {
    color: '#6272a4',
  },
  'hljs-meta': {
    color: '#6272a4',
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
});
