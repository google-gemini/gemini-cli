/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';

import {
  isAmazonUrl,
  extractTitle,
  extractPrice,
  extractBullets,
} from './amazon-url-parser.js';

describe('amazon-url-parser', () => {
  describe('isAmazonUrl', () => {
    it('detects amazon domains', () => {
      expect(isAmazonUrl('https://amzn.in/d/test')).toBe(true);

      expect(isAmazonUrl('https://www.amazon.in/product/dp/123')).toBe(true);

      expect(isAmazonUrl('https://google.com')).toBe(false);
    });
  });

  describe('extractTitle', () => {
    it('extracts product title', () => {
      const html = `
        <span id="productTitle">
          ASUS Vivobook 15
        </span>
      `;

      expect(extractTitle(html)).toBe('ASUS Vivobook 15');
    });
  });

  describe('extractPrice', () => {
    it('extracts product price', () => {
      const html = `
        <span class="a-price-whole">
          54,990
        </span>
      `;

      expect(extractPrice(html)).toBe('54,990');
    });
  });

  describe('extractBullets', () => {
    it('extracts feature bullets', () => {
      const html = `
        <span class="a-list-item">
          Intel i5 Processor
        </span>

        <span class="a-list-item">
          16GB RAM
        </span>
      `;

      expect(extractBullets(html)).toEqual(['Intel i5 Processor', '16GB RAM']);
    });
  });
});
