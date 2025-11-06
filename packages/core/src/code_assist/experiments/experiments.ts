/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodeAssistServer } from '../server.js';
import { getClientMetadata } from './client_metadata.js';
import type { ListExperimentsResponse, Flag } from './types.js';

export interface Experiments {
  flags: Record<string, Flag>;
  experimentIds: number[];
}

let experimentsPromise: Promise<Experiments> | undefined;

/**
 * Gets the experiments from the server.
 *
 * The experiments are cached so that they are only fetched once.
 */
export async function getExperiments(
  server: CodeAssistServer,
): Promise<Experiments> {
  if (experimentsPromise) {
    return await experimentsPromise;
  }

  experimentsPromise = (async () => {
    const metadata = await getClientMetadata();
    const response = await server.listExperiments(metadata);
    return parseExperiments(response);
  })();
  return await experimentsPromise;
}

function parseExperiments(response: ListExperimentsResponse): Experiments {
  const flags: Record<string, Flag> = {};
  for (const flag of response.flags ?? []) {
    if (flag.name) {
      flags[flag.name] = flag;
    }
  }
  return {
    flags,
    experimentIds: response.experimentIds ?? [],
  };
}
