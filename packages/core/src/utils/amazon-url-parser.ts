/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { fetchWithTimeout } from './fetch.js';

const AMAZON_HOST_PATTERNS = ['amazon.', 'amzn.in', 'amzn.to'];

const REQUEST_TIMEOUT_MS = 10000;

const USER_AGENT = 'Mozilla/5.0 (compatible; GeminiCLI-AmazonParser/1.0)';

export interface AmazonProductMetadata {
  canonicalUrl: string;
  title?: string;
  price?: string;
  bullets: string[];
  brand?: string;
  model?: string;
}

/**
 * Checks whether a URL belongs to Amazon or Amazon short links.
 */
export function isAmazonUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    const host = parsed.hostname.toLowerCase();

    return AMAZON_HOST_PATTERNS.some((pattern) => host.includes(pattern));
  } catch {
    return false;
  }
}

/**
 * Expands shortened Amazon URLs (amzn.in / amzn.to)
 * into canonical redirected product URLs.
 */
export async function expandAmazonUrl(url: string): Promise<string> {
  const response = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS, {
    method: 'HEAD',
    redirect: 'follow',
    headers: {
      'User-Agent': USER_AGENT,
    },
  });

  return response.url;
}

/**
 * Removes HTML tags and decodes common entities.
 */
function cleanText(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract product title from Amazon HTML.
 */
export function extractTitle(html: string): string | undefined {
  const match = html.match(/<span[^>]*id="productTitle"[^>]*>(.*?)<\/span>/is);

  if (!match?.[1]) {
    return undefined;
  }

  return cleanText(match[1]);
}

/**
 * Extract product price.
 */
export function extractPrice(html: string): string | undefined {
  const patterns = [
    /<span[^>]*class="a-price-whole"[^>]*>(.*?)<\/span>/is,
    /<span[^>]*id="priceblock_ourprice"[^>]*>(.*?)<\/span>/is,
    /<span[^>]*id="priceblock_dealprice"[^>]*>(.*?)<\/span>/is,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return undefined;
}

/**
 * Extract product brand.
 */
export function extractBrand(html: string): string | undefined {
  const patterns = [
    /<a[^>]*id="bylineInfo"[^>]*>(.*?)<\/a>/is,
    /"brand"\s*:\s*"([^"]+)"/is,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return undefined;
}

/**
 * Extract model name if available.
 */
export function extractModel(html: string): string | undefined {
  const patterns = [
    /"model"\s*:\s*"([^"]+)"/is,
    /Item model number<\/span>\s*<span[^>]*>(.*?)<\/span>/is,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return undefined;
}

/**
 * Extract bullet-point specifications/features.
 */
export function extractBullets(html: string): string[] {
  const matches = [
    ...html.matchAll(/<span[^>]*class="a-list-item"[^>]*>(.*?)<\/span>/gis),
  ];

  const cleaned = matches
    .map((match) => cleanText(match[1]))
    .filter((text) => text.length > 3 && text.length < 300);

  return [...new Set(cleaned)].slice(0, 8);
}

/**
 * Fetch raw HTML from product page.
 */
export async function fetchAmazonHtml(url: string): Promise<string> {
  const response = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  return response.text();
}

/**
 * Extract structured Amazon product metadata.
 */
export async function extractAmazonMetadata(
  url: string,
): Promise<AmazonProductMetadata> {
  const canonicalUrl = await expandAmazonUrl(url);

  const html = await fetchAmazonHtml(canonicalUrl);

  return {
    canonicalUrl,
    title: extractTitle(html),
    price: extractPrice(html),
    bullets: extractBullets(html),
    brand: extractBrand(html),
    model: extractModel(html),
  };
}

/**
 * Format structured metadata into LLM-friendly context.
 */
export function formatAmazonContext(metadata: AmazonProductMetadata): string {
  const sections: string[] = [];

  sections.push('Amazon Product Metadata');

  if (metadata.title) {
    sections.push(`Title: ${metadata.title}`);
  }

  if (metadata.brand) {
    sections.push(`Brand: ${metadata.brand}`);
  }

  if (metadata.model) {
    sections.push(`Model: ${metadata.model}`);
  }

  if (metadata.price) {
    sections.push(`Price: ${metadata.price}`);
  }

  sections.push(`URL: ${metadata.canonicalUrl}`);

  if (metadata.bullets.length > 0) {
    sections.push('\nKey Features:');

    for (const bullet of metadata.bullets) {
      sections.push(`- ${bullet}`);
    }
  }

  return sections.join('\n');
}
