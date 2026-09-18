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
  default?: HttpProxyAgentCtor;
}

const mod = rawProxyAgent as unknown as InteropShape;
const HttpProxyAgent: HttpProxyAgentCtor =
  mod.HttpProxyAgent ||
  mod.default ||
  (rawProxyAgent as unknown as HttpProxyAgentCtor);

if (typeof HttpProxyAgent === 'function') {
  const ctorRecord = HttpProxyAgent as unknown as Record<string, unknown>;
  ctorRecord['HttpProxyAgent'] = HttpProxyAgent;
  ctorRecord['default'] = HttpProxyAgent;
}

export { HttpProxyAgent };
// eslint-disable-next-line import/no-default-export
export default HttpProxyAgent;
