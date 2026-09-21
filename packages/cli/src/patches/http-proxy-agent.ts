/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
/* eslint-disable import/no-relative-packages */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable no-restricted-syntax */

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

const baseCtor =
  resolvedCtor ??
  (class {
    constructor() {
      throw new Error(
        'HttpProxyAgent constructor could not be resolved from http-proxy-agent',
      );
    }
  } as unknown as HttpProxyAgentCtor);

const HttpProxyAgent = new Proxy(baseCtor, {
  get(target, prop, receiver) {
    if (prop === 'HttpProxyAgent' || prop === 'default') {
      return receiver;
    }
    return Reflect.get(target, prop, receiver);
  },
});

export { HttpProxyAgent };
// eslint-disable-next-line import/no-default-export
export default HttpProxyAgent;
