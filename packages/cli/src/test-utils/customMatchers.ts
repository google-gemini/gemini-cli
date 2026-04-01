/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vitest/globals" />

import { expect, type Assertion } from 'vitest';
import path from 'node:path';
import stripAnsi from 'strip-ansi';
import type { TextBuffer } from '../ui/components/shared/text-buffer.js';
import { type DOMElement as _DOMElement, type DOMNode } from 'ink';

export interface CustomMatchers<R = unknown> {
  toMatchSvgSnapshot(options?: {
    allowEmpty?: boolean;
    name?: string;
  }): Promise<R>;
  toContainComponent(componentName: string): R;
  toHaveOnlyValidCharacters(): R;
}

// RegExp to detect invalid characters: backspace, and ANSI escape codes
// eslint-disable-next-line no-control-regex
const invalidCharsRegex = /[\b\x1b]/;

type TestableDOMNode = DOMNode & {
  internal_componentName?: string;
  internal_testId?: string;
  attributes?: {
    internal_componentName?: string;
    internal_testId?: string;
  };
  style?: {
    internal_componentName?: string;
    internal_testId?: string;
  };
};

/**
 * Traverses the Ink tree to find a node matching a predicate.
 */
function findInTree(
  node: TestableDOMNode,
  predicate: (node: TestableDOMNode) => boolean,
): TestableDOMNode | undefined {
  if (predicate(node)) return node;
  if ('childNodes' in node && node.childNodes) {
    for (const child of node.childNodes) {
      const found = findInTree(child as TestableDOMNode, predicate);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Checks if the Ink DOM tree contains a specific component by name or testId.
 */
export function toContainComponent(
  this: Assertion,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  received: any,
  componentName: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { isNot } = this as any;

  const rootNode = received.rootNode || received.renderResult?.rootNode;

  // Check logical tree presence (Automatic via Ink Root)
  const pass = rootNode
    ? !!findInTree(rootNode as TestableDOMNode, (node) => {
        if (node.nodeName === '#text') return false;
        const match =
          node.internal_componentName === componentName ||
          node.internal_testId === componentName ||
          node.attributes?.internal_componentName === componentName ||
          node.attributes?.internal_testId === componentName ||
          node.style?.internal_componentName === componentName ||
          node.style?.internal_testId === componentName;
        return match;
      })
    : false;

  return {
    pass,
    message: () =>
      `Expected component "${componentName}" ${isNot ? 'NOT ' : ''}to be present in the Ink tree.`,
  };
}

const callCountByTest = new Map<string, number>();

export async function toMatchSvgSnapshot(
  this: Assertion,
  renderInstance: {
    lastFrameRaw?: (options?: { allowEmpty?: boolean }) => string;
    lastFrame?: (options?: { allowEmpty?: boolean }) => string;
    generateSvg: () => string;
  },
  options?: { allowEmpty?: boolean; name?: string },
) {
  const currentTestName = expect.getState().currentTestName;
  if (!currentTestName) {
    throw new Error('toMatchSvgSnapshot must be called within a test');
  }
  const testPath = expect.getState().testPath;
  if (!testPath) {
    throw new Error('toMatchSvgSnapshot requires testPath');
  }

  let textContent: string;
  if (renderInstance.lastFrameRaw) {
    textContent =
      typeof renderInstance.lastFrameRaw === 'function'
        ? renderInstance.lastFrameRaw({
            allowEmpty: options?.allowEmpty,
          })
        : renderInstance.lastFrameRaw;
  } else if (renderInstance.lastFrame) {
    textContent =
      typeof renderInstance.lastFrame === 'function'
        ? renderInstance.lastFrame({ allowEmpty: options?.allowEmpty })
        : renderInstance.lastFrame;
  } else {
    throw new Error(
      'toMatchSvgSnapshot requires a renderInstance with either lastFrameRaw or lastFrame',
    );
  }
  const svgContent = renderInstance.generateSvg();

  const sanitize = (name: string) =>
    name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');

  const testId = testPath + ':' + currentTestName;
  let count = callCountByTest.get(testId) ?? 0;
  count++;
  callCountByTest.set(testId, count);

  const snapshotName =
    options?.name ??
    (count > 1 ? `${currentTestName}-${count}` : currentTestName);

  const svgFileName =
    sanitize(path.basename(testPath).replace(/\.test\.tsx?$/, '')) +
    '-' +
    sanitize(snapshotName) +
    '.snap.svg';
  const svgDir = path.join(path.dirname(testPath), '__snapshots__');
  const svgFilePath = path.join(svgDir, svgFileName);

  // Assert the text matches standard snapshot, stripping ANSI for stability
  expect(stripAnsi(textContent)).toMatchSnapshot();

  // Assert the SVG matches the file snapshot
  await expect(svgContent).toMatchFileSnapshot(svgFilePath);

  return { pass: true, message: () => '' };
}

function toHaveOnlyValidCharacters(this: Assertion, buffer: TextBuffer) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { isNot } = this as any;
  let pass = true;
  const invalidLines: Array<{ line: number; content: string }> = [];

  for (let i = 0; i < buffer.lines.length; i++) {
    const line = buffer.lines[i];
    if (line.includes('\n')) {
      pass = false;
      invalidLines.push({ line: i, content: line });
      break; // Fail fast on newlines
    }
    if (invalidCharsRegex.test(line)) {
      pass = false;
      invalidLines.push({ line: i, content: line });
    }
  }

  return {
    pass,
    message: () =>
      `Expected buffer ${isNot ? 'not ' : ''}to have only valid characters, but found invalid characters in lines:\n${invalidLines
        .map((l) => `  [${l.line}]: "${l.content}"`)
        .join('\n')}`,
    actual: buffer.lines,
    expected: 'Lines with no line breaks, backspaces, or escape codes.',
  };
}

expect.extend({
  toHaveOnlyValidCharacters,
  toMatchSvgSnapshot,
  toContainComponent,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);

// Extend Vitest's `expect` interface with the custom matcher's type definition.
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends CustomMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends CustomMatchers {}

  interface CustomMatchers<T = unknown> {
    toHaveOnlyValidCharacters(): T;
    toMatchSvgSnapshot(options?: {
      allowEmpty?: boolean;
      name?: string;
    }): Promise<void>;
    toContainComponent(componentName: string): T;
  }
}
