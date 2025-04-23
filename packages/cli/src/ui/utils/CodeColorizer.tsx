/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { common, createLowlight } from 'lowlight';
import type {
  Root,
  Element,
  Text as HastText,
  ElementContent,
  RootContent,
} from 'hast';
import { themeManager } from '../themes/theme-manager.js';
import { Theme } from '../themes/theme.js';

// Configure themeing and parsing utilities.
const lowlight = createLowlight(common);

function renderHastNode(
  node: Root | Element | HastText | RootContent,
  theme: Theme,
  inheritedColor: string | undefined,
): React.ReactNode {
  if (node.type === 'text') {
    // Use the color passed down from parent element, if any
    return <Text color={inheritedColor}>{node.value}</Text>;
  }

  // Handle Element Nodes: Determine color and pass it down, don't wrap
  if (node.type === 'element') {
    const nodeClasses: string[] =
      (node.properties?.className as string[]) || [];
    let elementColor: string | undefined = undefined;

    // Find color defined specifically for this element's class
    for (let i = nodeClasses.length - 1; i >= 0; i--) {
      const color = theme.getInkColor(nodeClasses[i]);
      if (color) {
        elementColor = color;
        break;
      }
    }

    // Determine the color to pass down: Use this element's specific color
    // if found, otherwise, continue passing down the already inherited color.
    const colorToPassDown = elementColor || inheritedColor;

    // Recursively render children, passing the determined color down
    // Ensure child type matches expected HAST structure (ElementContent is common)
    const children = node.children?.map(
      (child: ElementContent, index: number) => (
        <React.Fragment key={index}>
          {renderHastNode(child, theme, colorToPassDown)}
        </React.Fragment>
      ),
    );

    // Element nodes now only group children; color is applied by Text nodes.
    // Use a React Fragment to avoid adding unnecessary elements.
    return <React.Fragment>{children}</React.Fragment>;
  }

  // Handle Root Node: Start recursion with initial inherited color
  if (node.type === 'root') {
    // Pass down the initial inheritedColor (likely undefined from the top call)
    // Ensure child type matches expected HAST structure (RootContent is common)
    return node.children?.map((child: RootContent, index: number) => (
      <React.Fragment key={index}>
        {renderHastNode(child, theme, inheritedColor)}
      </React.Fragment>
    ));
  }

  // Handle unknown or unsupported node types
  return null;
}

/**
 * Renders syntax-highlighted code for Ink applications using a selected theme.
 *
 * @param code The code string to highlight.
 * @param language The language identifier (e.g., 'javascript', 'css', 'html')
 * @returns A React.ReactNode containing Ink <Text> elements for the highlighted code.
 */
export function colorizeCode(
  code: string,
  language: string | null,
): React.ReactNode {
  const codeToHighlight = code.replace(/\n$/, '');
  const activeTheme = themeManager.getActiveTheme();

  try {
    const hastTree =
      !language || !lowlight.registered(language)
        ? lowlight.highlightAuto(codeToHighlight)
        : lowlight.highlight(language, codeToHighlight);

    // Render the HAST tree using the adapted theme
    // Apply the theme's default foreground color to the top-level Text element
    return (
      <Text color={activeTheme.defaultColor}>
        {renderHastNode(hastTree, activeTheme, undefined)}
      </Text>
    );
  } catch (error) {
    console.error(
      `[colorizeCode] Error highlighting code for language "${language}":`,
      error,
    );
    // Fallback to plain text with default color on error
    return <Text color={activeTheme.defaultColor}>{codeToHighlight}</Text>;
  }
}
