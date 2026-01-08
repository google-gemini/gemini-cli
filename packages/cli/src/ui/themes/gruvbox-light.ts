/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { interpolateColor } from './color-utils.js';

// Gruvbox Light color palette
// https://github.com/morhetz/gruvbox
const gruvboxLightColors: ColorsTheme = {
	type: 'light',
	Background: '#fbf1c7',
	Foreground: '#3c3836',
	LightBlue: '#076678',
	AccentBlue: '#076678',
	AccentPurple: '#8f3f71',
	AccentCyan: '#427b58',
	AccentGreen: '#79740e',
	AccentYellow: '#b57614',
	AccentRed: '#9d0006',
	DiffAdded: '#ebdbb2',
	DiffRemoved: '#ebdbb2',
	Comment: '#bdae93',
	Gray: '#928374',
	DarkGray: interpolateColor('#bdae93', '#fbf1c7', 0.5),
	GradientColors: ['#af3a03', '#b57614'],
};

// Additional Gruvbox colors for syntax highlighting
const orange = '#af3a03';
const neutral_orange = '#d65d0e';

export const GruvboxLight: Theme = new Theme(
	'Gruvbox Light',
	'light',
	{
		hljs: {
			display: 'block',
			overflowX: 'auto',
			padding: '0.5em',
			background: gruvboxLightColors.Background,
			color: gruvboxLightColors.Foreground,
		},
		'hljs-keyword': {
			color: gruvboxLightColors.AccentPurple,
			fontWeight: 'bold',
		},
		'hljs-selector-tag': {
			color: gruvboxLightColors.AccentRed,
			fontWeight: 'bold',
		},
		'hljs-literal': {
			color: orange,
			fontWeight: 'bold',
		},
		'hljs-section': {
			color: gruvboxLightColors.AccentBlue,
			fontWeight: 'bold',
		},
		'hljs-link': {
			color: orange,
		},
		'hljs-function .hljs-keyword': {
			color: gruvboxLightColors.AccentPurple,
		},
		'hljs-subst': {
			color: gruvboxLightColors.Foreground,
		},
		'hljs-string': {
			color: gruvboxLightColors.AccentGreen,
		},
		'hljs-title': {
			color: gruvboxLightColors.AccentYellow,
			fontWeight: 'bold',
		},
		'hljs-title.function_': {
			color: gruvboxLightColors.AccentBlue,
			fontWeight: 'bold',
		},
		'hljs-name': {
			color: gruvboxLightColors.AccentRed,
			fontWeight: 'bold',
		},
		'hljs-type': {
			color: gruvboxLightColors.AccentPurple,
			fontWeight: 'bold',
		},
		'hljs-attribute': {
			color: gruvboxLightColors.AccentBlue,
		},
		'hljs-attr': {
			color: orange,
		},
		'hljs-symbol': {
			color: orange,
		},
		'hljs-bullet': {
			color: gruvboxLightColors.AccentRed,
		},
		'hljs-addition': {
			color: gruvboxLightColors.AccentGreen,
		},
		'hljs-variable': {
			color: gruvboxLightColors.AccentRed,
		},
		'hljs-template-tag': {
			color: gruvboxLightColors.AccentCyan,
		},
		'hljs-template-variable': {
			color: gruvboxLightColors.AccentRed,
		},
		'hljs-comment': {
			color: gruvboxLightColors.Comment,
		},
		'hljs-quote': {
			color: gruvboxLightColors.AccentCyan,
		},
		'hljs-deletion': {
			color: gruvboxLightColors.AccentRed,
		},
		'hljs-meta': {
			color: neutral_orange,
		},
		'hljs-built_in': {
			color: gruvboxLightColors.AccentCyan,
		},
		'hljs-regexp': {
			color: gruvboxLightColors.AccentCyan,
		},
		'hljs-number': {
			color: orange,
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
	gruvboxLightColors,
);
