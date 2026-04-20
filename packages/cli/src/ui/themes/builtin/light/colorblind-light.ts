/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Colorblind-friendly light theme.
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
 * - Status colors: success = blue, error = orange, warning = dark yellow.
 */

import { type ColorsTheme, Theme } from '../../theme.js';
import { interpolateColor } from '../../color-utils.js';

const colorblindLightColors: ColorsTheme = {
  type: 'light',
  Background: '#FFFFFF',
  Foreground: '#1E1E2E',
  LightBlue: '#1E66F5',
  AccentBlue: '#1E66F5',
  AccentPurple: '#8839EF',
  AccentCyan: '#179299',
  AccentGreen: '#1E66F5', // Use blue instead of green for success indicators
  AccentYellow: '#DF8E1D',
  AccentRed: '#E64553', // Orange-red, distinguishable from blue for all types
  DiffAdded: '#D5E5FF', // Blue-tinted background for additions
  DiffRemoved: '#FFE0CC', // Orange-tinted background for removals
  Comment: '#6C6F85',
  Gray: '#6C6F85',
  DarkGray: interpolateColor('#6C6F85', '#FFFFFF', 0.5),
  InputBackground: '#E6E9EF',
  MessageBackground: '#F5F5F5',
  FocusBackground: '#D5E5FF',
  FocusColor: '#1E66F5',
  GradientColors: ['#1E66F5', '#8839EF'],
};

export const ColorblindLight: Theme = new Theme(
  'Colorblind Light',
  'light',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      color: colorblindLightColors.Foreground,
      background: colorblindLightColors.Background,
    },
    'hljs-comment': {
      color: colorblindLightColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: colorblindLightColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-keyword': {
      color: colorblindLightColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: colorblindLightColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: colorblindLightColors.AccentBlue,
    },
    'hljs-symbol': {
      color: colorblindLightColors.AccentCyan,
    },
    'hljs-name': {
      color: colorblindLightColors.AccentBlue,
    },
    'hljs-link': {
      color: colorblindLightColors.AccentBlue,
      textDecoration: 'underline',
    },
    'hljs-built_in': {
      color: colorblindLightColors.AccentCyan,
    },
    'hljs-type': {
      color: colorblindLightColors.AccentCyan,
      fontWeight: 'bold',
    },
    'hljs-number': {
      color: colorblindLightColors.AccentPurple,
    },
    'hljs-class': {
      color: colorblindLightColors.AccentCyan,
    },
    'hljs-string': {
      color: colorblindLightColors.AccentYellow,
    },
    'hljs-meta-string': {
      color: colorblindLightColors.AccentYellow,
    },
    'hljs-regexp': {
      color: colorblindLightColors.AccentYellow,
    },
    'hljs-template-tag': {
      color: colorblindLightColors.AccentPurple,
    },
    'hljs-subst': {
      color: colorblindLightColors.Foreground,
    },
    'hljs-function': {
      color: colorblindLightColors.Foreground,
    },
    'hljs-title': {
      color: colorblindLightColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-params': {
      color: colorblindLightColors.Foreground,
    },
    'hljs-formula': {
      color: colorblindLightColors.Foreground,
    },
    'hljs-doctag': {
      color: colorblindLightColors.Comment,
    },
    'hljs-meta': {
      color: colorblindLightColors.Gray,
    },
    'hljs-meta-keyword': {
      color: colorblindLightColors.Gray,
    },
    'hljs-tag': {
      color: colorblindLightColors.Gray,
    },
    'hljs-variable': {
      color: colorblindLightColors.AccentPurple,
    },
    'hljs-template-variable': {
      color: colorblindLightColors.AccentPurple,
    },
    'hljs-attr': {
      color: colorblindLightColors.LightBlue,
    },
    'hljs-attribute': {
      color: colorblindLightColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: colorblindLightColors.LightBlue,
    },
    'hljs-section': {
      color: colorblindLightColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-bullet': {
      color: colorblindLightColors.AccentYellow,
    },
    'hljs-selector-id': {
      color: colorblindLightColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-selector-class': {
      color: colorblindLightColors.AccentYellow,
    },
    'hljs-selector-attr': {
      color: colorblindLightColors.AccentYellow,
    },
    'hljs-selector-pseudo': {
      color: colorblindLightColors.AccentYellow,
    },
    'hljs-addition': {
      backgroundColor: colorblindLightColors.DiffAdded,
      color: colorblindLightColors.AccentBlue,
      display: 'inline-block',
      width: '100%',
    },
    'hljs-deletion': {
      backgroundColor: colorblindLightColors.DiffRemoved,
      color: colorblindLightColors.AccentRed,
      display: 'inline-block',
      width: '100%',
    },
  },
  colorblindLightColors,
);
