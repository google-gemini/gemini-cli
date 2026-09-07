/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export type BoxStyle = 'rounded' | 'single' | 'double';

export interface BoxBorder {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
}

export const BOX_BORDERS: Record<BoxStyle, BoxBorder> = {
  rounded: {
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    horizontal: '─',
    vertical: '│',
  },
  single: {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│',
  },
  double: {
    topLeft: '╔',
    topRight: '╗',
    bottomLeft: '╚',
    bottomRight: '╝',
    horizontal: '═',
    vertical: '║',
  },
};

export interface BoxOptions {
  title?: string;
  style?: BoxStyle;
  minWidth?: number;
  padding?: number;
  align?: 'left' | 'center' | 'right';
}

export class AsciiBox {
  public static create(content: string | string[], options: BoxOptions = {}): string {
    const style = options.style ?? 'rounded';
    const border = BOX_BORDERS[style];
    const padding = options.padding ?? 1;
    const align = options.align ?? 'left';

    const rawLines = Array.isArray(content) ? content : content.split('\n');
    const contentLines = rawLines.map((l) => l.trimEnd());

    // Calculate maximum content width
    let maxContentWidth = options.title ? options.title.length + 2 : 0;
    for (const line of contentLines) {
      if (line.length > maxContentWidth) {
        maxContentWidth = line.length;
      }
    }
    const innerWidth = Math.max(maxContentWidth, (options.minWidth ?? 0) - 2 - padding * 2);

    const padSpaces = ' '.repeat(padding);
    const result: string[] = [];

    // Header / Top border
    if (options.title) {
      const titleText = ` ${options.title} `;
      const remainingDashes = Math.max(0, innerWidth + padding * 2 - titleText.length);
      const leftDashes = border.horizontal.repeat(2);
      const rightDashes = border.horizontal.repeat(Math.max(0, remainingDashes - 2));
      result.push(`${border.topLeft}${leftDashes}${titleText}${rightDashes}${border.topRight}`);
    } else {
      result.push(`${border.topLeft}${border.horizontal.repeat(innerWidth + padding * 2)}${border.topRight}`);
    }

    // Content lines
    for (const line of contentLines) {
      const spacesNeeded = innerWidth - line.length;
      let formattedLine: string;
      if (align === 'center') {
        const leftSpace = ' '.repeat(Math.floor(spacesNeeded / 2));
        const rightSpace = ' '.repeat(spacesNeeded - Math.floor(spacesNeeded / 2));
        formattedLine = `${leftSpace}${line}${rightSpace}`;
      } else if (align === 'right') {
        formattedLine = `${' '.repeat(spacesNeeded)}${line}`;
      } else {
        formattedLine = `${line}${' '.repeat(spacesNeeded)}`;
      }
      result.push(`${border.vertical}${padSpaces}${formattedLine}${padSpaces}${border.vertical}`);
    }

    // Bottom border
    result.push(`${border.bottomLeft}${border.horizontal.repeat(innerWidth + padding * 2)}${border.bottomRight}`);

    return result.join('\n');
  }

  public static horizontalConnect(leftBox: string, arrow: string, rightBox: string): string {
    const leftLines = leftBox.split('\n');
    const rightLines = rightBox.split('\n');

    const maxHeight = Math.max(leftLines.length, rightLines.length);
    const leftWidth = leftLines[0]?.length ?? 0;
    const arrowPadding = ` ${arrow} `;
    const arrowMidIndex = Math.floor(maxHeight / 2);

    const merged: string[] = [];
    for (let i = 0; i < maxHeight; i++) {
      const leftPart = leftLines[i] ?? ' '.repeat(leftWidth);
      const isMid = i === arrowMidIndex;
      const connector = isMid ? arrowPadding : ' '.repeat(arrowPadding.length);
      const rightPart = rightLines[i] ?? '';
      merged.push(`${leftPart}${connector}${rightPart}`);
    }

    return merged.join('\n');
  }

  public static tree(root: string, items: { name: string; details?: string }[]): string {
    const lines: string[] = [root];
    for (let i = 0; i < items.length; i++) {
      const isLast = i === items.length - 1;
      const branch = isLast ? '└── ' : '├── ';
      const item = items[i];
      const desc = item.details ? ` (${item.details})` : '';
      lines.push(`${branch}${item.name}${desc}`);
    }
    return lines.join('\n');
  }
}
