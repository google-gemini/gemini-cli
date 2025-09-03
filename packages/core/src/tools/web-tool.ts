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

// function extractUrls(text: string): string[] {
//   const urlRegex = /(https?:\/\/[^\s]+)/g;
//   return text.match(urlRegex) || [];
// }

function convertGitHubUrl(url: string): string {
  if (url.includes('github.com') && url.includes('/blob/')) {
    return url
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/blob/', '/');
  }
  return url;
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
  /** Pattern for validation */
  pattern?: string;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Follow redirects */
  followRedirects?: boolean;
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
    const { url } = this.params;
    
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
      let content: string;

      if (contentType.includes('text/html')) {
        const html = await response.text();
        content = convert(html, {
          wordwrap: false,
          selectors: [
            ...HTML_CLEANING_SELECTORS,
            { selector: 'a', options: { ignoreHref: true } },
            { selector: 'img', format: 'skip' },
          ],
        });
      } else {
        content = await response.text();
      }

      content = content.substring(0, MAX_CONTENT_LENGTH);

      return {
        success: true,
        op: 'fetch',
        url: processedUrl,
        content,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        llmContent: `web(fetch): Retrieved content from ${processedUrl}\n\n${content}`,
        returnDisplay: `web(fetch): Fetched ${content.length} chars from ${processedUrl}`,
      };
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
    const { urls, limit = 10 } = this.params;
    
    if (!urls?.length) {
      throw new Error('URLs array required for batch operation');
    }

    const processUrls = urls.slice(0, limit);
    const results: Array<{ url: string; success: boolean; content?: string; error?: string; status?: number }> = [];
    const errors: string[] = [];

    for (const url of processUrls) {
      if (signal.aborted) break;
      
      try {
        const processedUrl = convertGitHubUrl(url);
        const response = await fetchWithSignal(processedUrl, URL_FETCH_TIMEOUT_MS, signal);
        
        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          let content: string;
          
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
          
          results.push({ 
            url: processedUrl, 
            success: true, 
            content,
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
    const batchSummary = `web(batch): Processed ${results.length} URLs, ${successCount} successful`;
    
    const contentSummary = results
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
    
    if (!output) {
      throw new Error('Output file path required for save operation');
    }

    const processedUrl = convertGitHubUrl(url);

    try {
      const response = await fetchWithSignal(processedUrl, URL_FETCH_TIMEOUT_MS, signal);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
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

      // Ensure directory exists
      const dir = path.dirname(output);
      if (!existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
      }

      await fs.writeFile(output, content, 'utf8');

      return {
        success: true,
        op: 'save',
        url: processedUrl,
        saved: output,
        status: response.status,
        llmContent: `web(save): Saved content from ${processedUrl} to ${output} (${content.length} chars)`,
        returnDisplay: `web(save): Saved ${path.basename(output)} (${content.length} chars)`,
      };
    } catch (error) {
      const errorMessage = `Save failed: ${getErrorMessage(error)}`;
      return {
        success: false,
        op: 'save',
        url: processedUrl,
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }
}

export class WebTool extends BaseDeclarativeTool<WebParams, WebResult> {
  static readonly Name: string = 'web_tool';

  constructor(config: Config) {
    super(
      WebTool.Name,
      'Web Tool',
      'Web operations: fetch (get content), extract (links/images/metadata/tables), batch (multiple URLs), validate (check status/response time), save (download to file). Supports GitHub URLs, custom headers.',
      Kind.Fetch,
      {
        type: 'object',
        required: ['op'],
        properties: {
          op: {
            type: 'string',
            enum: ['fetch', 'extract', 'batch', 'validate', 'save'],
            description: 'Operation: fetch (get content), extract (structured data), batch (multiple URLs), validate (check URLs), save (download)',
          },
          url: {
            type: 'string',
            description: 'Target URL (supports GitHub blob URLs)',
          },
          urls: {
            type: 'array',
            items: { type: 'string' },
            description: 'Multiple URLs for batch/validate operations',
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
            description: 'Maximum URLs to process in batch operation (default: 10)',
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
        if (!urls?.length) return 'batch operation requires urls array';
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