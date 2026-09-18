/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
/* eslint-disable import/no-relative-packages */

import * as rawProxyAgent from '../../../../node_modules/https-proxy-agent/dist/index.js';

type HttpsProxyAgentCtor = typeof rawProxyAgent.HttpsProxyAgent;

interface InteropShape {
  HttpsProxyAgent?: HttpsProxyAgentCtor;
  default?: HttpsProxyAgentCtor | InteropShape;
}

const mod = rawProxyAgent as unknown as InteropShape;
const defaultMod = mod.default as InteropShape | undefined;
const defaultNamedCtor = defaultMod?.HttpsProxyAgent;

let resolvedCtor: HttpsProxyAgentCtor | undefined;
if (typeof mod.HttpsProxyAgent === 'function') {
  resolvedCtor = mod.HttpsProxyAgent;
} else if (typeof mod.default === 'function') {
  resolvedCtor = mod.default;
} else if (typeof defaultNamedCtor === 'function') {
  resolvedCtor = defaultNamedCtor;
} else if (typeof rawProxyAgent === 'function') {
  resolvedCtor = rawProxyAgent as unknown as HttpsProxyAgentCtor;
}

const HttpsProxyAgent =
  resolvedCtor ??
  (class {
    constructor() {
      throw new Error(
        'HttpsProxyAgent constructor could not be resolved from https-proxy-agent',
      );
    }
  } as unknown as HttpsProxyAgentCtor);

if (typeof HttpsProxyAgent === 'function') {
  try {
    Object.defineProperty(HttpsProxyAgent, 'HttpsProxyAgent', {
      value: HttpsProxyAgent,
      configurable: true,
      writable: true,
      enumerable: true,
    });
    Object.defineProperty(HttpsProxyAgent, 'default', {
      value: HttpsProxyAgent,
      configurable: true,
      writable: true,
      enumerable: true,
    });
  } catch {
    // Safely ignore if the constructor is frozen or properties are non-configurable
  }
}

export { HttpsProxyAgent };
// eslint-disable-next-line import/no-default-export
export default HttpsProxyAgent;
