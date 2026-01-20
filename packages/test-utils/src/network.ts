/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';

export const canListenOnLocalhost = (timeoutMs = 2000): boolean => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      "const net=require('net');const server=net.createServer();server.listen(0,'127.0.0.1',()=>server.close(()=>process.exit(0)));server.on('error',()=>process.exit(1));",
    ],
    { timeout: timeoutMs },
  );
  return result.status === 0;
};
