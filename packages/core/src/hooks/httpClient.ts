/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HttpClient } from './types.js';

/**
 * Default HTTP client implementation for plugins
 */
export class DefaultHttpClient implements HttpClient {
  private readonly baseHeaders: Record<string, string> = {
    'User-Agent': 'Gemini-CLI-Hooks/1.0',
  };

  async get(url: string, options?: RequestInit): Promise<Response> {
    return this.request(url, { ...options, method: 'GET' });
  }

  async post(
    url: string,
    body?: unknown,
    options?: RequestInit,
  ): Promise<Response> {
    return this.request(url, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        ...this.baseHeaders,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  }

  async put(
    url: string,
    body?: unknown,
    options?: RequestInit,
  ): Promise<Response> {
    return this.request(url, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        ...this.baseHeaders,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  }

  async delete(url: string, options?: RequestInit): Promise<Response> {
    return this.request(url, { ...options, method: 'DELETE' });
  }

  private async request(url: string, options: RequestInit): Promise<Response> {
    const mergedOptions = {
      ...options,
      headers: {
        ...this.baseHeaders,
        ...options.headers,
      },
    };

    return fetch(url, mergedOptions);
  }
}
