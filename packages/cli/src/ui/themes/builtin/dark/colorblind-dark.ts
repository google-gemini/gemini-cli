/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Colorblind-friendly dark theme.
 *
 * Uses a blue/orange palette that is distinguishable across all major
 * color-vision deficiency types (protanopia, deuteranopia, tritanopia).
 *
 * Key design choices:
 * - Avoids red/green combinations that are problematic for protanopia
 *   and deuteranopia.
 * - Uses blue and orange as the primary accent pair, which maintain high
 *   contrast across all three deficiency types.
 * - Diff colors use blue-tinted (added) and orange-tinted (removed)
 *   backgrounds instead of the traditional green/red.
 * - Status colors: success = blue, error = orange, warning = yellow.
 */

import { type ColorsTheme, Theme } from '../../theme.js';
import { interpolateColor } from '../../color-utils.js';

const colorblindDarkColors: ColorsTheme = {
  type: 'dark',
  Background: '#1E1E2E',
  Foreground: '#CDD6F4',
  LightBlue: '#89B4FA',
  AccentBlue: '#89B4FA',
  AccentPurple: '#CBA6F7',
  AccentCyan: '#94E2D5',
  AccentGreen: '#89B4FA', // Use blue instead of green for success indicators
  AccentYellow: '#F9E2AF',
  AccentRed: '#FAB387', // Use orange instead of red for error indicators
  DiffAdded: '#1E3A5F', // Blue-tinted background for additions
  DiffRemoved: '#5F3A1E', // Orange-tinted background for removals
  Comment: '#7F849C',
  Gray: '#7F849C',
  DarkGray: interpolateColor('#7F849C', '#1E1E2E', 0.5),
  FocusBackground: '#1E3A5F',
  FocusColor: '#89B4FA',
  GradientColors: ['#89B4FA', '#CBA6F7'],
};

export const ColorblindDark: Theme = new Theme(
  'Colorblind',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      color: colorblindDarkColors.Foreground,
      background: colorblindDarkColors.Background,
    },
    'hljs-comment': {
      color: colorblindDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: colorblindDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-keyword': {
      color: colorblindDarkColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: colorblindDarkColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: colorblindDarkColors.AccentBlue,
    },
    'hljs-symbol': {
      color: colorblindDarkColors.AccentCyan,
    },
    'hljs-name': {
      color: colorblindDarkColors.AccentBlue,
    },
    'hljs-link': {
      color: colorblindDarkColors.AccentBlue,
      textDecoration: 'underline',
    },
    'hljs-built_in': {
      color: colorblindDarkColors.AccentCyan,
    },
    'hljs-type': {
      color: colorblindDarkColors.AccentCyan,
      fontWeight: 'bold',
    },
    'hljs-number': {
      color: colorblindDarkColors.AccentPurple,
    },
    'hljs-class': {
      color: colorblindDarkColors.AccentCyan,
    },
    'hljs-string': {
      color: colorblindDarkColors.AccentYellow,
    },
    'hljs-meta-string': {
      color: colorblindDarkColors.AccentYellow,
    },
    'hljs-regexp': {
      color: colorblindDarkColors.AccentYellow,
    },
    'hljs-template-tag': {
      color: colorblindDarkColors.AccentPurple,
    },
    'hljs-subst': {
      color: colorblindDarkColors.Foreground,
    },
    'hljs-function': {
      color: colorblindDarkColors.Foreground,
    },
    'hljs-title': {
      color: colorblindDarkColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-params': {
      color: colorblindDarkColors.Foreground,
    },
    'hljs-formula': {
      color: colorblindDarkColors.Foreground,
    },
    'hljs-doctag': {
      color: colorblindDarkColors.Comment,
    },
    'hljs-meta': {
      color: colorblindDarkColors.Gray,
    },
    'hljs-meta-keyword': {
      color: colorblindDarkColors.Gray,
    },
    'hljs-tag': {
      color: colorblindDarkColors.Gray,
    },
    'hljs-variable': {
      color: colorblindDarkColors.AccentPurple,
    },
    'hljs-template-variable': {
      color: colorblindDarkColors.AccentPurple,
    },
    'hljs-attr': {
      color: colorblindDarkColors.LightBlue,
    },
    'hljs-attribute': {
      color: colorblindDarkColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: colorblindDarkColors.LightBlue,
    },
    'hljs-section': {
      color: colorblindDarkColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-bullet': {
      color: colorblindDarkColors.AccentYellow,
    },
    'hljs-selector-id': {
      color: colorblindDarkColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-selector-class': {
      color: colorblindDarkColors.AccentYellow,
    },
    'hljs-selector-attr': {
      color: colorblindDarkColors.AccentYellow,
    },
    'hljs-selector-pseudo': {
      color: colorblindDarkColors.AccentYellow,
    },
    'hljs-addition': {
      backgroundColor: colorblindDarkColors.DiffAdded,
      color: colorblindDarkColors.AccentBlue,
      display: 'inline-block',
      width: '100%',
    },
    'hljs-deletion': {
      backgroundColor: colorblindDarkColors.DiffRemoved,
      color: '#FAB387',
      display: 'inline-block',
      width: '100%',
    },
  },
  colorblindDarkColors,
);
