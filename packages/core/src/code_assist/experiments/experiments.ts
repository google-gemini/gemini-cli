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

let experiments: Experiments | undefined;

/**
 * Gets the experiments from the server.
 *
 * The experiments are cached so that they are only fetched once.
 */
export async function getExperiments(
  server: CodeAssistServer,
): Promise<Experiments> {
  if (experiments) {
    return experiments;
  }

  const metadata = await getClientMetadata();
  const response = await server.listExperiments(metadata);
  experiments = parseExperiments(response);
  return experiments;
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
    experimentIds: response.experiment_ids ?? [],
  };
}
