/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  // ToolCallConfirmationDetails,
  ToolInvocation,
  ToolResult,
} from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  // ToolConfirmationOutcome,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { getErrorMessage } from '../utils/errors.js';
import type { Config } from '../config/config.js';
// import { ApprovalMode } from '../config/config.js';
// import { fetchWithTimeout, isPrivateIp } from '../utils/fetch.js';
import { convert } from 'html-to-text';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

const URL_FETCH_TIMEOUT_MS = 10000;
const MAX_CONTENT_LENGTH = 50000;

// Common selectors for cleaning HTML content
const HTML_CLEANING_SELECTORS = [
  { selector: 'nav', format: 'skip' },
  { selector: 'header', format: 'skip' },
  { selector: 'footer', format: 'skip' },
  { selector: 'aside', format: 'skip' },
  { selector: '.sidebar', format: 'skip' },
  { selector: '.navigation', format: 'skip' },
  { selector: '.menu', format: 'skip' },
  { selector: '.footer', format: 'skip' },
  { selector: '.site-footer', format: 'skip' },
  { selector: '.page-footer', format: 'skip' },
  { selector: '.social-links', format: 'skip' },
  { selector: '.language-selector', format: 'skip' },
  { selector: '.copyright', format: 'skip' },
  { selector: '.terms', format: 'skip' },
  { selector: '.legal', format: 'skip' },
  { selector: '.support-links', format: 'skip' },
  { selector: '.ads', format: 'skip' },
  { selector: '.advertisement', format: 'skip' },
  { selector: '.promo', format: 'skip' },
  { selector: 'script', format: 'skip' },
  { selector: 'style', format: 'skip' },
];

function convertGitHubUrl(url: string): string {
  if (url.includes('github.com') && url.includes('/blob/')) {
    return url
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/blob/', '/');
  }
  return url;
}

// Helper function to match filename patterns (supports wildcards)
function matchesPattern(filename: string, pattern: string): boolean {
  if (!pattern) return true;
  
  // Convert wildcard pattern to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
    .replace(/\*/g, '.*')                 // Convert * to .*
    .replace(/\?/g, '.');                 // Convert ? to .
  
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(filename);
}

// Helper function to extract and filter links from HTML
function extractLinksFromHtml(
  html: string, 
  baseUrl: string,
  options: {
    selector?: string;
    pattern?: string;
    extensions?: string[];
  } = {}
): { url: string; filename: string; text?: string }[] {
  const { selector = 'a[href]', pattern, extensions } = options;
  
  // Enhanced HTML parsing to support CSS selectors
  const links: { url: string; filename: string; text?: string }[] = [];
  
  // For now, we'll use regex with enhanced selector support
  let linkRegex: RegExp;
  
  if (selector === 'a[href]' || !selector) {
    // Default: all links with href - fixed to handle nested HTML content
    linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  } else if (selector.includes('[download]')) {
    // Links with download attribute - fixed to handle nested HTML content
    linkRegex = /<a[^>]*download[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  } else if (selector.includes('.')) {
    // Class-based selector (simplified) - fixed to handle nested HTML content
    const className = selector.replace(/^a\./, '').replace(/\[.*\]/, '');
    linkRegex = new RegExp(`<a[^>]*class=["'][^"']*${className}[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>`, 'gi');
  } else {
    // Fallback to default - fixed to handle nested HTML content
    linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  }
  
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    let url = match[1];
    const linkContent = match[2]?.trim(); // This might contain HTML like <img...>
    
    // Extract text from HTML content
    let linkText = '';
    if (linkContent) {
      // Remove HTML tags and get text content
      linkText = linkContent.replace(/<[^>]*>/g, '').trim();
      // If no text content, try to extract alt text from images
      if (!linkText) {
        const altMatch = linkContent.match(/alt=["']([^"']*)["']/i);
        if (altMatch) {
          linkText = altMatch[1];
        }
      }
    }
    
    // Skip non-file links (like javascript:, mailto:, #anchors)
    if (url.startsWith('javascript:') || url.startsWith('mailto:') || url.startsWith('#')) {
      continue;
    }
    
    // Convert relative URLs to absolute
    if (url.startsWith('/')) {
      const baseUrlObj = new URL(baseUrl);
      url = `${baseUrlObj.origin}${url}`;
    } else if (!url.startsWith('http')) {
      url = new URL(url, baseUrl).href;
    }
    
    // Extract filename from URL
    let filename = '';
    try {
      const urlObj = new URL(url);
      filename = urlObj.pathname.split('/').pop() || '';
      
      // Remove query parameters from filename
      filename = filename.split('?')[0];
      
      // If no filename in path, try to extract from query params or use link text
      if (!filename && linkText) {
        // Try to extract filename from link text if it looks like a file
        const textMatch = linkText.match(/([^\/\\]+\.[a-zA-Z0-9]{1,6})$/);
        if (textMatch) {
          filename = textMatch[1];
        }
      }
    } catch {
      continue; // Skip invalid URLs
    }
    
    // Skip if no filename
    if (!filename) continue;
    
    // Apply pattern filter
    if (pattern && !matchesPattern(filename, pattern)) {
      continue;
    }
    
    // Apply extension filter
    if (extensions && extensions.length > 0) {
      const hasMatchingExt = extensions.some(ext => 
        filename.toLowerCase().endsWith(ext.toLowerCase())
      );
      if (!hasMatchingExt) continue;
    }
    
    links.push({ url, filename, text: linkText });
  }
  
  return links;
}

// Helper function to create fetch with both timeout and external signal
async function fetchWithSignal(
  url: string, 
  timeout: number, 
  externalSignal?: AbortSignal,
  options?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  // Combine external signal with timeout signal
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    }
    externalSignal.addEventListener('abort', () => controller.abort());
  }
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (externalSignal?.aborted) {
      throw new Error('Request was cancelled');
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

interface WebParams {
  /** Operation type */
  op: 'fetch' | 'extract' | 'batch' | 'validate' | 'save';
  /** URL for single operations */
  url?: string;
  /** Multiple URLs for batch operations */
  urls?: string[];
  /** Content extraction type */
  extract?: 'text' | 'links' | 'images' | 'metadata' | 'tables';
  /** CSS selector for targeted extraction */
  selector?: string;
  /** Output file path */
  output?: string;
  /** Maximum results for batch operations */
  limit?: number;
  /** Offset for batch operations (skip first N results) */
  offset?: number;
  /** Pattern for validation */
  pattern?: string;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Follow redirects */
  followRedirects?: boolean;
  
  // Enhanced fetch operation parameters
  /** Extract links from page (for fetch operation) */
  extractLinks?: boolean;
  /** Filter links by filename pattern (wildcards supported: stock_val*, *.xlsx) */
  linkPattern?: string;
  /** Filter links by file extensions */
  linkExtensions?: string[];
  /** CSS selector for link extraction (default: 'a[href]') */
  linkSelector?: string;
  
  // Enhanced batch operation parameters  
  /** Batch operation type ('fetch' or 'save') */
  operation?: 'fetch' | 'save';
  /** Output directory for batch save operations */
  outputDir?: string;
  /** Strategy for handling filename conflicts */
  nameConflictStrategy?: 'overwrite' | 'rename' | 'skip';
}

interface WebResult extends ToolResult {
  success: boolean;
  op: string;
  url?: string;
  urls?: string[];
  content?: string;
  extracted?: unknown;
  saved?: string;
  status?: number;
  headers?: Record<string, string>;
  errors?: string[];
  results?: Array<{ url: string; success: boolean; content?: string; error?: string; status?: number }>;
}

class WebToolInvocation extends BaseToolInvocation<WebParams, WebResult> {
  constructor(
    params: WebParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const { op, url, urls, extract } = this.params;
    
    const actions = {
      fetch: `Fetching content from ${url}`,
      extract: `Extracting ${extract || 'content'} from ${url}`,
      batch: `Processing ${urls?.length || 0} URLs`,
      validate: `Validating ${url || urls?.length || 0} URL(s)`,
      save: `Saving content from ${url}`,
    };
    
    return actions[op] || `Web operation: ${op}`;
  }

  // override async shouldConfirmExecute(): Promise<
  //   ToolCallConfirmationDetails | false
  // > {
  //   if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
  //     return false;
  //   }

  //   const { op, url, urls } = this.params;
  //   const targetUrls = urls || (url ? [url] : []);
  //   const processedUrls = targetUrls.map(convertGitHubUrl);

  //   const confirmationDetails: ToolCallConfirmationDetails = {
  //     type: 'info',
  //     title: `Confirm Web Tool Operation`,
  //     prompt: `${op.toUpperCase()}: ${processedUrls.join(', ')}`,
  //     urls: processedUrls,
  //     onConfirm: async (outcome: ToolConfirmationOutcome) => {
  //       if (outcome === ToolConfirmationOutcome.ProceedAlways) {
  //         this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
  //       }
  //     },
  //   };
  //   return confirmationDetails;
  // }

  async execute(signal: AbortSignal): Promise<WebResult> {
    const { op } = this.params;

    try {
      switch (op) {
        case 'fetch': return await this.fetchContent(signal);
        case 'extract': return await this.extractContent(signal);
        case 'batch': return await this.batchProcess(signal);
        case 'validate': return await this.validateUrls(signal);
        case 'save': return await this.saveContent(signal);
        default: throw new Error(`Unknown operation: ${op}`);
      }
    } catch (error: unknown) {
      const errorMessage = `Web tool operation failed: ${getErrorMessage(error)}`;
      return {
        success: false,
        op,
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.WEB_FETCH_PROCESSING_ERROR,
        },
      };
    }
  }

  private async fetchContent(signal: AbortSignal): Promise<WebResult> {
    const { url, extractLinks, linkPattern, linkExtensions, linkSelector } = this.params;
    
    if (!url) {
      throw new Error('URL required for fetch operation');
    }

    const processedUrl = convertGitHubUrl(url);

    try {
      const response = await fetchWithSignal(processedUrl, URL_FETCH_TIMEOUT_MS, signal);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const html = await response.text();
      let content: string;
      let extractedLinks: { url: string; filename: string; text?: string }[] | undefined;

      // If extractLinks is requested, extract and filter links
      if (extractLinks && contentType.includes('text/html')) {
        extractedLinks = extractLinksFromHtml(html, processedUrl, {
          selector: linkSelector,
          pattern: linkPattern,
          extensions: linkExtensions,
        });
      }

      if (contentType.includes('text/html')) {
        content = convert(html, {
          wordwrap: false,
          selectors: [
            ...HTML_CLEANING_SELECTORS,
            { selector: 'a', options: { ignoreHref: !extractLinks } }, // Keep links if extractLinks is true
            { selector: 'img', format: 'skip' },
          ],
        });
      } else {
        content = html;
      }

      content = content.substring(0, MAX_CONTENT_LENGTH);

      const result: WebResult = {
        success: true,
        op: 'fetch',
        url: processedUrl,
        content,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        llmContent: `web(fetch): Retrieved content from ${processedUrl}\n\n${content}`,
        returnDisplay: `web(fetch): Fetched ${content.length} chars from ${processedUrl}`,
      };

      // Add extracted links to result if requested
      if (extractedLinks) {
        result.extracted = extractedLinks;
        result.llmContent += `\n\nExtracted ${extractedLinks.length} matching links:\n` + 
          extractedLinks.map(link => `- ${link.filename}: ${link.url}`).join('\n');
        result.returnDisplay += `, found ${extractedLinks.length} matching links`;
      }

      return result;
    } catch (error) {
      const errorMessage = `Fetch failed for ${processedUrl}: ${getErrorMessage(error)}`;
      return {
        success: false,
        op: 'fetch',
        url: processedUrl,
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.WEB_FETCH_FALLBACK_FAILED,
        },
      };
    }
  }

  private async extractContent(signal: AbortSignal): Promise<WebResult> {
    const { url, extract = 'text', selector } = this.params;
    
    if (!url) {
      throw new Error('URL required for extract operation');
    }

    const processedUrl = convertGitHubUrl(url);
    
    try {
      const response = await fetchWithSignal(processedUrl, URL_FETCH_TIMEOUT_MS, signal);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      let extracted: unknown;

      switch (extract) {
        case 'text':
          extracted = convert(html, {
            wordwrap: false,
            selectors: selector ? [{ selector }] : HTML_CLEANING_SELECTORS,
          });
          break;
          
        case 'links':
          const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
          const links: Array<{ url: string; text: string }> = [];
          let linkMatch;
          while ((linkMatch = linkRegex.exec(html)) !== null) {
            const linkUrl = linkMatch[1];
            const linkText = linkMatch[2].trim();
            if (linkUrl && linkText) {
              links.push({ url: linkUrl, text: linkText });
            }
          }
          extracted = links;
          break;
          
        case 'images':
          const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
          const images: Array<{ src: string; alt?: string }> = [];
          let imgMatch;
          while ((imgMatch = imgRegex.exec(html)) !== null) {
            images.push({ 
              src: imgMatch[1], 
              alt: imgMatch[2] || undefined 
            });
          }
          extracted = images;
          break;
          
        case 'metadata':
          const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
          const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i);
          const keywordsMatch = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']*)["'][^>]*>/i);
          
          extracted = {
            title: titleMatch?.[1]?.trim() || null,
            description: descMatch?.[1]?.trim() || null,
            keywords: keywordsMatch?.[1]?.trim() || null,
            url: processedUrl,
          };
          break;
          
        case 'tables':
          const tableRegex = /<table[^>]*>(.*?)<\/table>/gis;
          const tables: Array<{ html: string; text: string }> = [];
          let tableMatch;
          while ((tableMatch = tableRegex.exec(html)) !== null) {
            const tableHtml = tableMatch[0];
            const tableText = convert(tableHtml, { wordwrap: false });
            if (tableText.trim()) {
              tables.push({ html: tableHtml, text: tableText });
            }
          }
          extracted = tables;
          break;
          
        default:
          extracted = convert(html, { wordwrap: false });
      }

      return {
        success: true,
        op: 'extract',
        url: processedUrl,
        extracted,
        status: response.status,
        llmContent: `web(extract): Extracted ${extract} from ${processedUrl}\n\n${JSON.stringify(extracted, null, 2)}`,
        returnDisplay: `web(extract): Extracted ${extract} from ${processedUrl} (${Array.isArray(extracted) ? extracted.length : typeof extracted} items)`,
      };
    } catch (error) {
      const errorMessage = `Content extraction failed: ${getErrorMessage(error)}`;
      return {
        success: false,
        op: 'extract',
        url: processedUrl,
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }

  private async batchProcess(signal: AbortSignal): Promise<WebResult> {
    const { 
      url, 
      urls, 
      limit = 50, // Increased default limit for batch downloads
      offset = 0, // Start from beginning by default
      operation = 'fetch', 
      outputDir, 
      nameConflictStrategy = 'rename',
      linkPattern,
      linkExtensions,
      linkSelector
    } = this.params;
    
    let processUrls: string[];
    
    if (urls?.length) {
      // Direct URLs provided
      processUrls = urls.slice(offset, offset + limit);
    } else if (url && (linkPattern || linkExtensions)) {
      // Single URL with link discovery - need to fetch and extract links first
      try {
        const response = await fetchWithSignal(url, URL_FETCH_TIMEOUT_MS, signal);
        if (!response.ok) {
          throw new Error(`Failed to fetch page: HTTP ${response.status} ${response.statusText}`);
        }
        
        const html = await response.text();
        const extractedLinks = extractLinksFromHtml(html, url, {
          selector: linkSelector,
          pattern: linkPattern,
          extensions: linkExtensions,
        });
        
        if (extractedLinks.length === 0) {
          return {
            success: false,
            op: 'batch',
            error: {
              message: `No matching links found for pattern "${linkPattern}" on ${url}`,
              type: 'NO_LINKS_FOUND' as any,
            },
            llmContent: `web(batch): No links found matching pattern "${linkPattern}" on ${url}`,
            returnDisplay: `web(batch): No matching links found`,
          };
        }
        
        processUrls = extractedLinks.map(link => link.url).slice(offset, offset + limit);
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        return {
          success: false,
          op: 'batch',
          error: {
            message: `Failed to discover links from ${url}: ${errorMessage}`,
            type: 'LINK_DISCOVERY_FAILED' as any,
          },
          llmContent: `web(batch): Link discovery failed: ${errorMessage}`,
          returnDisplay: `web(batch): Link discovery failed`,
        };
      }
    } else {
      throw new Error('Either urls array or url with linkPattern/linkExtensions required for batch operation');
    }
    const results: Array<{ 
      url: string; 
      success: boolean; 
      content?: string; 
      error?: string; 
      status?: number;
      filename?: string;
      saved?: boolean;
    }> = [];
    const errors: string[] = [];

    // Create output directory if batch save is requested
    if (operation === 'save' && outputDir) {
      try {
        await fs.mkdir(outputDir, { recursive: true });
      } catch (error) {
        throw new Error(`Failed to create output directory ${outputDir}: ${getErrorMessage(error)}`);
      }
    }

    for (const url of processUrls) {
      if (signal.aborted) break;
      
      try {
        const processedUrl = convertGitHubUrl(url);
        const response = await fetchWithSignal(processedUrl, URL_FETCH_TIMEOUT_MS, signal);
        
        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          let content: string;
          let filename: string | undefined;
          let saved = false;

          if (operation === 'save' && outputDir) {
            // For save operation, handle as binary or text file
            const isBinaryFile = this.isBinaryContentType(contentType);
            filename = this.generateFileNameFromUrl(processedUrl);
            filename = this.adjustFileExtension(filename, contentType);

            let finalPath = path.join(outputDir, filename);

            // Handle filename conflicts
            if (nameConflictStrategy === 'rename' && existsSync(finalPath)) {
              const ext = path.extname(filename);
              const base = path.basename(filename, ext);
              let counter = 1;
              do {
                filename = `${base}_${counter}${ext}`;
                finalPath = path.join(outputDir, filename);
                counter++;
              } while (existsSync(finalPath));
            } else if (nameConflictStrategy === 'skip' && existsSync(finalPath)) {
              results.push({ 
                url: processedUrl, 
                success: true, 
                filename,
                saved: false,
                status: response.status 
              });
              continue;
            }

            if (isBinaryFile) {
              const buffer = await response.arrayBuffer();
              await fs.writeFile(finalPath, Buffer.from(buffer));
            } else {
              const text = await response.text();
              await fs.writeFile(finalPath, text, 'utf-8');
            }
            saved = true;
            content = `Saved to ${finalPath}`;
          } else {
            // For fetch operation, get content summary
            if (contentType.includes('text/html')) {
              const html = await response.text();
              content = convert(html, {
                wordwrap: false,
                selectors: HTML_CLEANING_SELECTORS,
              }).substring(0, 1000); // Limit per URL for batch
            } else {
              const text = await response.text();
              content = text.substring(0, 1000);
            }
          }
          
          results.push({ 
            url: processedUrl, 
            success: true, 
            content,
            filename,
            saved,
            status: response.status 
          });
        } else {
          const error = `HTTP ${response.status} ${response.statusText}`;
          results.push({ 
            url: processedUrl, 
            success: false, 
            error,
            status: response.status 
          });
          errors.push(`${processedUrl}: ${error}`);
        }
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        results.push({ url, success: false, error: errorMsg });
        errors.push(`${url}: ${errorMsg}`);
      }
    }

    const successCount = results.filter(r => r.success).length;
    const savedCount = results.filter(r => r.saved).length;
    
    // Calculate total available and processing status
    let totalAvailable = processUrls.length;
    if (url && (linkPattern || linkExtensions)) {
      // For link discovery, we need to get the total count before slicing
      try {
        const response = await fetchWithSignal(url, URL_FETCH_TIMEOUT_MS, signal);
        if (response.ok) {
          const html = await response.text();
          const allLinks = extractLinksFromHtml(html, url, {
            selector: linkSelector,
            pattern: linkPattern,
            extensions: linkExtensions,
          });
          totalAvailable = allLinks.length;
        }
      } catch {
        // If we can't get total, use current batch size
        totalAvailable = processUrls.length;
      }
    }
    
    const isComplete = (offset + results.length) >= totalAvailable;
    const remainingCount = Math.max(0, totalAvailable - (offset + results.length));
    
    let batchSummary: string;
    if (operation === 'save') {
      batchSummary = `web(batch-save): Processed ${results.length} URLs (${offset + 1}-${offset + results.length} of ${totalAvailable}), ${successCount} successful, ${savedCount} files saved to ${outputDir}`;
      if (!isComplete) {
        batchSummary += `. ${remainingCount} files remaining. Use offset=${offset + results.length} to continue.`;
      } else {
        batchSummary += `. All files processed.`;
      }
    } else {
      batchSummary = `web(batch): Processed ${results.length} URLs (${offset + 1}-${offset + results.length} of ${totalAvailable}), ${successCount} successful`;
      if (!isComplete) {
        batchSummary += `. ${remainingCount} URLs remaining. Use offset=${offset + results.length} to continue.`;
      } else {
        batchSummary += `. All URLs processed.`;
      }
    }
    
    const contentSummary = operation === 'save' 
      ? results
          .filter(r => r.success && r.filename)
          .map(r => {
            const filename = r.filename || 'unknown';
            const fullPath = outputDir ? path.resolve(outputDir, filename) : filename;
            return `\n- ${fullPath}: ${r.saved ? 'saved successfully' : 'skipped (already exists)'}`;
          })
          .join('')
      : results
          .filter(r => r.success && r.content)
          .map(r => `\n=== ${r.url} ===\n${r.content}`)
          .join('\n');

    return {
      success: successCount > 0,
      op: 'batch',
      urls: processUrls,
      results,
      errors: errors.length > 0 ? errors : undefined,
      llmContent: `${batchSummary}${contentSummary}`,
      returnDisplay: batchSummary,
    };
  }

  private async validateUrls(signal: AbortSignal): Promise<WebResult> {
    const { url, urls, pattern } = this.params;
    
    const targetUrls = urls || (url ? [url] : []);
    if (!targetUrls.length) {
      throw new Error('URLs required for validation');
    }

    const results: Array<{ 
      url: string; 
      success: boolean; 
      status?: number; 
      error?: string; 
      valid?: boolean;
      responseTime?: number;
    }> = [];
    const errors: string[] = [];

    for (const targetUrl of targetUrls) {
      if (signal.aborted) break;
      
      const startTime = Date.now();
      try {
        const processedUrl = convertGitHubUrl(targetUrl);
        const response = await fetchWithSignal(processedUrl, URL_FETCH_TIMEOUT_MS, signal, {
          method: 'HEAD', // Use HEAD for validation to save bandwidth
        });
        
        const responseTime = Date.now() - startTime;
        let valid = response.ok;
        
        if (pattern && valid) {
          // If pattern specified, need to fetch content
          const fullResponse = await fetchWithSignal(processedUrl, URL_FETCH_TIMEOUT_MS, signal);
          const content = await fullResponse.text();
          const regex = new RegExp(pattern, 'i');
          valid = regex.test(content);
        }

        results.push({
          url: processedUrl,
          success: response.ok,
          status: response.status,
          valid,
          responseTime,
        });

        if (!response.ok) {
          errors.push(`${processedUrl}: HTTP ${response.status}`);
        }
      } catch (error) {
        const responseTime = Date.now() - startTime;
        const errorMsg = getErrorMessage(error);
        results.push({ 
          url: targetUrl, 
          success: false, 
          error: errorMsg, 
          valid: false,
          responseTime,
        });
        errors.push(`${targetUrl}: ${errorMsg}`);
      }
    }

    const validCount = results.filter(r => r.valid !== false).length;
    const validationSummary = `web(validate): Checked ${results.length} URLs, ${validCount} valid`;

    return {
      success: validCount > 0,
      op: 'validate',
      urls: targetUrls,
      results,
      errors: errors.length > 0 ? errors : undefined,
      llmContent: `${validationSummary}\n\nResults:\n${results.map(r => 
        `${r.url}: ${r.success ? `✓ HTTP ${r.status} (${r.responseTime}ms)` : `✗ ${r.error}`}${r.valid === false ? ' [Pattern not found]' : ''}`
      ).join('\n')}`,
      returnDisplay: validationSummary,
    };
  }

  private async saveContent(signal: AbortSignal): Promise<WebResult> {
    const { url, output } = this.params;
    
    if (!url) {
      throw new Error('URL required for save operation');
    }

    const processedUrl = convertGitHubUrl(url);
    
    // Auto-generate filename from URL if output not provided
    let finalOutputPath = output;
    if (!finalOutputPath) {
      finalOutputPath = this.generateFileNameFromUrl(processedUrl);
    }

    try {
      const response = await fetchWithSignal(processedUrl, URL_FETCH_TIMEOUT_MS, signal);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      
      // Detect if this is a binary file
      const isBinaryFile = this.isBinaryContentType(contentType);
      
      // Auto-adjust file extension based on content type if needed
      finalOutputPath = this.adjustFileExtension(finalOutputPath, contentType);

      // Ensure directory exists
      const dir = path.dirname(finalOutputPath);
      if (!existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
      }

      if (isBinaryFile) {
        // Handle binary files
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await fs.writeFile(finalOutputPath, buffer);
        
        return {
          success: true,
          op: 'save',
          url: processedUrl,
          saved: finalOutputPath,
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          llmContent: `web(save): Downloaded binary file from ${processedUrl} to ${finalOutputPath} (${buffer.length} bytes, ${contentType})`,
          returnDisplay: `web(save): Downloaded ${path.basename(finalOutputPath)} (${this.formatFileSize(buffer.length)}, ${this.getFileTypeFromContentType(contentType)})`,
        };
      } else {
        // Handle text files
        let content: string;
        
        if (contentType.includes('text/html')) {
          const html = await response.text();
          content = convert(html, {
            wordwrap: false,
            selectors: HTML_CLEANING_SELECTORS,
          });
        } else {
          content = await response.text();
        }

        await fs.writeFile(finalOutputPath, content, 'utf8');

        return {
          success: true,
          op: 'save',
          url: processedUrl,
          saved: finalOutputPath,
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          llmContent: `web(save): Saved text content from ${processedUrl} to ${finalOutputPath} (${content.length} chars, ${contentType})`,
          returnDisplay: `web(save): Saved ${path.basename(finalOutputPath)} (${this.formatFileSize(content.length)}, ${this.getFileTypeFromContentType(contentType)})`,
        };
      }
    } catch (error) {
      const errorMessage = `Save failed: ${getErrorMessage(error)}`;
      return {
        success: false,
        op: 'save',
        url: processedUrl,
        saved: finalOutputPath,
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }

  private generateFileNameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      
      // Extract just the filename from the path (last segment)
      const segments = pathname.split('/').filter(segment => segment.length > 0);
      let fileName = segments[segments.length - 1] || '';
      
      // Remove query parameters if they exist
      fileName = fileName.split('?')[0];
      
      // If no filename found, use domain name
      if (!fileName) {
        fileName = urlObj.hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
        if (!path.extname(fileName)) {
          fileName += '.html';
        }
      }
      
      // Clean up invalid filename characters but preserve the filename structure
      fileName = fileName.replace(/[/\\:*?"<>|]/g, '_');
      
      // If still no extension, add .html as default for web content
      if (!path.extname(fileName)) {
        fileName += '.html';
      }
      
      return fileName;
    } catch {
      // If URL parsing fails, create a timestamp-based filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      return `downloaded_${timestamp}.html`;
    }
  }

  private isBinaryContentType(contentType: string): boolean {
    const binaryTypes = [
      'image/', 'video/', 'audio/', 'application/pdf', 'application/zip',
      'application/x-zip-compressed', 'application/octet-stream',
      'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument',
      'application/x-rar-compressed', 'application/x-tar', 'application/gzip',
      'application/x-7z-compressed', 'application/vnd.adobe.flash',
      'application/x-shockwave-flash', 'application/java-archive',
      'application/x-executable', 'application/x-msdos-program',
      'application/vnd.android.package-archive'
    ];
    
    return binaryTypes.some(type => contentType.toLowerCase().includes(type.toLowerCase()));
  }

  private adjustFileExtension(filePath: string, contentType: string): string {
    const currentExt = path.extname(filePath).toLowerCase();
    const expectedExt = this.getExtensionFromContentType(contentType);
    
    // If file has no extension or wrong extension, adjust it
    if (!currentExt && expectedExt) {
      return filePath + expectedExt;
    }
    
    // Map of common content-type to extension mismatches to fix
    const extensionMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'application/pdf': '.pdf',
      'application/zip': '.zip',
      'application/json': '.json',
      'text/javascript': '.js',
      'text/css': '.css',
      'text/html': '.html',
      'text/plain': '.txt',
      'application/xml': '.xml',
      'text/xml': '.xml',
    };
    
    for (const [mimeType, ext] of Object.entries(extensionMap)) {
      if (contentType.includes(mimeType) && currentExt !== ext) {
        return filePath.replace(/\.[^.]*$/, '') + ext;
      }
    }
    
    return filePath;
  }

  private getExtensionFromContentType(contentType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png', 
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'application/pdf': '.pdf',
      'application/zip': '.zip',
      'application/json': '.json',
      'text/javascript': '.js',
      'text/css': '.css', 
      'text/html': '.html',
      'text/plain': '.txt',
      'application/xml': '.xml',
      'text/xml': '.xml',
      'video/mp4': '.mp4',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
    };
    
    for (const [mimeType, ext] of Object.entries(mimeToExt)) {
      if (contentType.includes(mimeType)) {
        return ext;
      }
    }
    
    return '';
  }

  private getFileTypeFromContentType(contentType: string): string {
    if (contentType.includes('image/')) return 'Image';
    if (contentType.includes('video/')) return 'Video';
    if (contentType.includes('audio/')) return 'Audio';
    if (contentType.includes('application/pdf')) return 'PDF';
    if (contentType.includes('application/zip')) return 'ZIP';
    if (contentType.includes('text/html')) return 'HTML';
    if (contentType.includes('text/plain')) return 'Text';
    if (contentType.includes('application/json')) return 'JSON';
    if (contentType.includes('text/css')) return 'CSS';
    if (contentType.includes('text/javascript')) return 'JavaScript';
    return contentType.split('/')[0] || 'File';
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

export class WebTool extends BaseDeclarativeTool<WebParams, WebResult> {
  static readonly Name: string = 'web_tool';

  constructor(config: Config) {
    super(
      WebTool.Name,
      'Web Tool',
      'Web operations: fetch (get content, discover links), extract (links/images/metadata/tables), batch (process multiple URLs OR discover and download files from single page), validate (check URLs), save (download files). For batch downloads: use url + linkPattern + outputDir to find and download matching files from a webpage.',
      Kind.Fetch,
      {
        type: 'object',
        required: ['op'],
        properties: {
          op: {
            type: 'string',
            enum: ['fetch', 'extract', 'batch', 'validate', 'save'],
            description: 'Operation: fetch (get content, discover links), extract (structured data), batch (multiple URLs OR single URL with link discovery and batch download), validate (check URLs), save (download single file)',
          },
          url: {
            type: 'string',
            description: 'Target URL (supports GitHub blob URLs). For batch operation: page URL to discover links from when used with linkPattern/linkExtensions',
          },
          urls: {
            type: 'array',
            items: { type: 'string' },
            description: 'Multiple URLs for batch/validate operations. Optional for batch if using url with link discovery',
          },
          extract: {
            type: 'string',
            enum: ['text', 'links', 'images', 'metadata', 'tables'],
            description: 'Content extraction type: text (clean text), links (all links), images (img src), metadata (title/description), tables (table data)',
          },
          selector: {
            type: 'string',
            description: 'CSS selector for targeted text extraction',
          },
          output: {
            type: 'string',
            description: 'Output file path for save operation',
          },
          limit: {
            type: 'number',
            description: 'Maximum URLs to process in batch operation (default: 50, set to higher value like 100 for large batches)',
          },
          offset: {
            type: 'number',
            description: 'Skip first N URLs in batch operation (default: 0). Use for pagination: offset=0 limit=50 for first 50, offset=50 limit=50 for next 50, etc.',
          },
          pattern: {
            type: 'string',
            description: 'Regex pattern to validate content in validate operation',
          },
          headers: {
            type: 'object',
            description: 'Custom HTTP headers (e.g., {"User-Agent": "MyBot"})',
          },
          followRedirects: {
            type: 'boolean',
            description: 'Follow HTTP redirects (default: true)',
          },
          // Enhanced fetch operation parameters
          extractLinks: {
            type: 'boolean',
            description: 'Extract and filter links from page content (for fetch operation)',
          },
          linkPattern: {
            type: 'string',
            description: 'Filter links by filename pattern (wildcards supported: stock_val*, *.xlsx)',
          },
          linkExtensions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter links by file extensions (e.g., [".xlsx", ".xls"])',
          },
          linkSelector: {
            type: 'string',
            description: 'CSS selector for link extraction (default: "a[href]")',
          },
          // Enhanced batch operation parameters
          operation: {
            type: 'string',
            enum: ['fetch', 'save'],
            description: 'Batch operation type: fetch (content summary) or save (download files to directory). Use "save" for downloading files',
          },
          outputDir: {
            type: 'string',
            description: 'Output directory for batch save operations. Required when operation=save. Example: "tmp" or "/path/to/downloads"',
          },
          nameConflictStrategy: {
            type: 'string',
            enum: ['overwrite', 'rename', 'skip'],
            description: 'Handle filename conflicts: overwrite existing, rename with counter, or skip',
          },
        },
      },
    );

    const proxy = config.getProxy();
    if (proxy) {
      setGlobalDispatcher(new ProxyAgent(proxy as string));
    }
  }

  protected override validateToolParamValues(params: WebParams): string | null {
    const { op, url, urls, extract, output } = params;

    switch (op) {
      case 'fetch':
        if (!url) return 'fetch operation requires url parameter';
        break;
      case 'extract':
        if (!url) return 'extract operation requires url parameter';
        if (extract && !['text', 'links', 'images', 'metadata', 'tables'].includes(extract)) {
          return 'extract parameter must be one of: text, links, images, metadata, tables';
        }
        break;
      case 'batch':
        // Batch supports two modes:
        // 1. Direct URLs: requires urls array
        // 2. Link discovery: requires url + (linkPattern OR linkExtensions)
        if (!urls?.length && !url) {
          return 'batch operation requires either urls array or url parameter';
        }
        if (url && !urls?.length && !params.linkPattern && !params.linkExtensions) {
          return 'batch operation with single url requires linkPattern or linkExtensions for link discovery';
        }
        break;
      case 'validate':
        if (!url && !urls?.length) return 'validate operation requires url or urls parameter';
        break;
      case 'save':
        if (!url) return 'save operation requires url parameter';
        if (!output) return 'save operation requires output parameter';
        break;
      default:
        return `Unknown operation: ${op}`;
    }

    return null;
  }

  protected createInvocation(params: WebParams): ToolInvocation<WebParams, WebResult> {
    return new WebToolInvocation(params);
  }
}