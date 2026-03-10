/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import fs from 'fs';
import path from 'path';

const REQUEST_PATH = path.resolve(process.cwd(), '.gemini', 'request.json');
const RESPONSE_PATH = path.resolve(process.cwd(), '.gemini', 'response.json');

interface RequestData {
  hostname: string;
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
    fs.writeFileSync(RESPONSE_PATH, JSON.stringify({ ...request, allow }));
    fs.unlinkSync(REQUEST_PATH);
    setRequest(null);
  };

  useInput((input, key) => {
    if (!request) return;

    if (key.return) {
      handleResponse(true);
    }

    if (input === 'y' || input === 'Y') {
      handleResponse(true);
    }

    if (input === 'n' || input === 'N') {
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
