/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
/* eslint-disable import/no-relative-packages */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable no-restricted-syntax */

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

const baseCtor =
  resolvedCtor ??
  (class {
    constructor() {
      throw new Error(
        'HttpsProxyAgent constructor could not be resolved from https-proxy-agent',
      );
    }
  } as unknown as HttpsProxyAgentCtor);

const HttpsProxyAgent = new Proxy(baseCtor, {
  get(target, prop, receiver) {
    if (prop === 'HttpsProxyAgent' || prop === 'default') {
      return receiver;
    }
    return Reflect.get(target, prop, receiver);
  },
});

export { HttpsProxyAgent };
// eslint-disable-next-line import/no-default-export
export default HttpsProxyAgent;
