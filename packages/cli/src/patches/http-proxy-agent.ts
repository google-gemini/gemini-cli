/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
/* eslint-disable import/no-relative-packages */

import * as rawProxyAgent from '../../../../node_modules/http-proxy-agent/dist/index.js';

type HttpProxyAgentCtor = typeof rawProxyAgent.HttpProxyAgent;

interface InteropShape {
  HttpProxyAgent?: HttpProxyAgentCtor;
  default?: HttpProxyAgentCtor | InteropShape;
}

const mod = rawProxyAgent as unknown as InteropShape;
const defaultMod = mod.default as InteropShape | undefined;
const defaultNamedCtor = defaultMod?.HttpProxyAgent;

let resolvedCtor: HttpProxyAgentCtor | undefined;
if (typeof mod.HttpProxyAgent === 'function') {
  resolvedCtor = mod.HttpProxyAgent;
} else if (typeof mod.default === 'function') {
  resolvedCtor = mod.default;
} else if (typeof defaultNamedCtor === 'function') {
  resolvedCtor = defaultNamedCtor;
} else if (typeof rawProxyAgent === 'function') {
  resolvedCtor = rawProxyAgent as unknown as HttpProxyAgentCtor;
}

const HttpProxyAgent =
  resolvedCtor ??
  (class {
    constructor() {
      throw new Error(
        'HttpProxyAgent constructor could not be resolved from http-proxy-agent',
      );
    }
  } as unknown as HttpProxyAgentCtor);

if (typeof HttpProxyAgent === 'function') {
  try {
    Object.defineProperty(HttpProxyAgent, 'HttpProxyAgent', {
      value: HttpProxyAgent,
      configurable: true,
      writable: true,
      enumerable: true,
    });
    Object.defineProperty(HttpProxyAgent, 'default', {
      value: HttpProxyAgent,
      configurable: true,
      writable: true,
      enumerable: true,
    });
  } catch {
    // Safely ignore if the constructor is frozen or properties are non-configurable
  }
}

export { HttpProxyAgent };
// eslint-disable-next-line import/no-default-export
export default HttpProxyAgent;
