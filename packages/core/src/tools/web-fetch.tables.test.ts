/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { convert } from 'html-to-text';
import { TABLE_SELECTOR } from './web-fetch.js';

// `web-fetch.test.ts` mocks html-to-text, so the conversion itself is exercised
// here against the real library and the selector the tool actually passes.
const LINK_SELECTOR = { selector: 'a', options: { ignoreHref: true } };

/** What a minifier ships: no whitespace between the cells. */
const MINIFIED =
  '<table><tr><th>Plan</th><th>Price</th><th>Seats</th></tr>' +
  '<tr><td>Starter</td><td>9 EUR</td><td>3</td></tr>' +
  '<tr><td>Pro</td><td>29 EUR</td><td>10</td></tr></table>';

/** The same table as a hand-written page indents it. */
const INDENTED = `<table>
  <tr>
    <th>Plan</th>
    <th>Price</th>
    <th>Seats</th>
  </tr>
  <tr>
    <td>Starter</td>
    <td>9 EUR</td>
    <td>3</td>
  </tr>
  <tr>
    <td>Pro</td>
    <td>29 EUR</td>
    <td>10</td>
  </tr>
</table>`;

const convertWith = (html: string, selectors: unknown[]) =>
  convert(html, { wordwrap: false, selectors: selectors as never });

/** The rows a reader can still make out in the converted text. */
const rowsOf = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim().split(/\s{2,}/))
    .filter((cells) => cells.length === 3);

describe('web fetch table conversion', () => {
  it.each([
    ['minified', MINIFIED],
    ['indented', INDENTED],
  ])('keeps a %s table in rows and columns', (_name, html) => {
    const text = convertWith(html, [LINK_SELECTOR, TABLE_SELECTOR]);

    expect(rowsOf(text)).toEqual([
      ['PLAN', 'PRICE', 'SEATS'],
      ['Starter', '9 EUR', '3'],
      ['Pro', '29 EUR', '10'],
    ]);
  });

  it('joins the cells of a minified table with nothing at all without the selector', () => {
    // The bug this pins: rendered as a block, not one boundary between two
    // values survives, so `9 EUR` and `3` and `Pro` become a single token.
    expect(convertWith(MINIFIED, [LINK_SELECTOR])).toBe(
      'PlanPriceSeatsStarter9 EUR3Pro29 EUR10',
    );
  });

  it('flattens an indented table into one line without the selector', () => {
    expect(convertWith(INDENTED, [LINK_SELECTOR])).toBe(
      'Plan Price Seats Starter 9 EUR 3 Pro 29 EUR 10',
    );
  });

  it('leaves content outside the table alone', () => {
    const text = convertWith(`<h1>Pricing</h1>${MINIFIED}<p>after</p>`, [
      LINK_SELECTOR,
      TABLE_SELECTOR,
    ]);

    expect(text.startsWith('PRICING')).toBe(true);
    expect(text.trimEnd().endsWith('after')).toBe(true);
  });
});
