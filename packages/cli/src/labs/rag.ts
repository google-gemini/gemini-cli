/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileDiscoveryService, findRagContext } from '@google/gemini-cli-core';

export async function rag(
  question: string,
  files: string[],
  recursive: boolean,
  all: boolean,
) {
  const fds = new FileDiscoveryService(process.cwd());
  const context = await findRagContext(question, files, recursive, all, fds);
  console.log(JSON.stringify(context, null, 2));
}
