/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import fs from 'node:fs';
import path from 'node:path';

const REQUEST_PATH = path.resolve(process.cwd(), '.gemini', 'request.json');
const RESPONSE_PATH = path.resolve(process.cwd(), '.gemini', 'response.json');

interface RequestData {
  hostname: string;
}
interface SystemError extends Error {
  code?: string;
}

export function ProxyPermissionDialog() {
  const [request, setRequest] = useState<RequestData | null>(null);

  useEffect(() => {
    const watcher = fs.watch(
      path.dirname(REQUEST_PATH),
      (eventType, filename) => {
        if (eventType === 'rename' && filename === 'request.json') {
          try {
            const requestData = fs.readFileSync(REQUEST_PATH, 'utf8');
            setRequest(JSON.parse(requestData));
          } catch {
            // Ignore
          }
        }
      },
    );

    return () => watcher.close();
  }, []);

  const handleResponse = (allow: boolean) => {
    try {
      const stats = fs.lstatSync(RESPONSE_PATH);
      if (stats.isSymbolicLink()) {
        // For security, if the response path is a symlink, just delete it.
        fs.unlinkSync(RESPONSE_PATH);
      }
    } catch (e) {
      // Check if it's an object with a 'code' property
      if (e && typeof e === 'object' && 'code' in e) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const err = e as SystemError;
        if (err.code !== 'ENOENT') throw err;
      } else {
        // If it's a weird error we didn't expect, throw it
        throw e;
      }
    }
    fs.writeFileSync(RESPONSE_PATH, JSON.stringify({ ...request, allow }));
    fs.unlinkSync(REQUEST_PATH);
    setRequest(null);
  };

  useInput((input, key) => {
    if (!request) return;

    if (key.return || input.toLowerCase() === 'y') {
      handleResponse(true);
    } else if (input.toLowerCase() === 'n') {
      handleResponse(false);
    }
  });

  if (!request) {
    return null;
  }

  return (
    <Box
      borderStyle="round"
      borderColor="yellow"
      padding={1}
      flexDirection="column"
    >
      <Text>
        A sandboxed process is requesting access to the following domain:
      </Text>
      <Text> </Text>
      <Text bold>{request.hostname}</Text>
      <Text> </Text>
      <Text>Allow this connection? (Y/n)</Text>
    </Box>
  );
}
