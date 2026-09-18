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
  default?: HttpsProxyAgentCtor;
}

const mod = rawProxyAgent as unknown as InteropShape;
const HttpsProxyAgent: HttpsProxyAgentCtor =
  mod.HttpsProxyAgent ||
  mod.default ||
  (rawProxyAgent as unknown as HttpsProxyAgentCtor);

if (typeof HttpsProxyAgent === 'function') {
  const ctorRecord = HttpsProxyAgent as unknown as Record<string, unknown>;
  ctorRecord['HttpsProxyAgent'] = HttpsProxyAgent;
  ctorRecord['default'] = HttpsProxyAgent;
}

export { HttpsProxyAgent };
// eslint-disable-next-line import/no-default-export
export default HttpsProxyAgent;
