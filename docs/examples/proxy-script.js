/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Example proxy server that listens on :::8877 and filters domains based on a config file.
// Set `GEMINI_SANDBOX_PROXY_COMMAND=scripts/example-proxy.js` to run proxy alongside sandbox
// Test via `curl https://example.com` inside sandbox (in shell mode or via shell tool)

import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';
import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import * as socks from 'socksv5';

const PROXY_PORT = 8877;
const SOCKS_PORT = 1080;
const CONFIG_PATH = path.resolve(process.cwd(), '.gemini', 'proxy.config.json');
const LOG_PATH = path.resolve(process.cwd(), '.gemini', 'proxy.log');
const REQUEST_PATH = path.resolve(process.cwd(), '.gemini', 'request.json');
const RESPONSE_PATH = path.resolve(process.cwd(), '.gemini', 'response.json');

let config = { allowlist: [], denylist: [], logging: false };

function readConfig() {
  try {
    const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = JSON.parse(configData);
  } catch (error) {
    console.error(
      `[PROXY] Error reading or parsing config file: ${error.message}`,
    );
    // Default to a safe/empty configuration
    config = { allowlist: [], denylist: [], logging: false };
  }
}

readConfig();

fs.watch(CONFIG_PATH, (eventType) => {
  if (eventType === 'change') {
    console.log(
      `[PROXY] Detected change in ${CONFIG_PATH}. Reloading configuration.`,
    );
    readConfig();
  }
});

function log(message) {
  if (config.logging) {
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${message}\n`);
  }
}

function wildcardMatch(pattern, text) {
  // Exact match
  if (pattern === text) {
    return true;
  }
  // Wildcard match
  if (pattern.startsWith('*.')) {
    return text.endsWith(pattern.substring(1)) || text === pattern.substring(2);
  }
  return false;
}

async function getPermission(hostname) {
  const request = { hostname, timestamp: Date.now() };
  try {
    const stats = fs.lstatSync(REQUEST_PATH);
    if (stats.isSymbolicLink()) {
      fs.unlinkSync(REQUEST_PATH);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e;
    }
  }
  fs.writeFileSync(REQUEST_PATH, JSON.stringify(request));

  // Wait for a response
  let attempts = 0;
  while (attempts < 20) {
    // Wait for up to 10 seconds
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const responseData = fs.readFileSync(RESPONSE_PATH, 'utf8');
      const response = JSON.parse(responseData);
      if (response.timestamp === request.timestamp) {
        fs.unlinkSync(RESPONSE_PATH);
        return response.allow;
      }
    } catch {
      // Ignore errors, file might not exist yet
    }
    attempts++;
  }
  return false; // Default to deny
}

// HTTP/HTTPS Proxy
const server = http.createServer((req, res) => {
  const message = `Denying non-CONNECT request for: ${req.method} ${req.url}`;
  console.log(`[PROXY] ${message}`);
  log(message);
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.on('connect', async (req, clientSocket, head) => {
  // req.url will be in the format "hostname:port" for a CONNECT request.
  let port, hostname;
  try {
    ({ port, hostname } = new URL(`http://${req.url}`));
  } catch {
    const message = `[HTTP] Invalid URL: ${req.url}`;
    console.log(`[PROXY] ${message}`);
    log(message);
    clientSocket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return;
  }

  const initialMessage = `[HTTP] Intercepted CONNECT request for: ${hostname}:${port}`;
  console.log(`[PROXY] ${initialMessage}`);
  log(initialMessage);

  const isDenied = config.denylist.some((pattern) =>
    wildcardMatch(pattern, hostname),
  );
  if (isDenied) {
    const message = `[HTTP] Denying connection to ${hostname}:${port} (denylisted)`;
    console.log(`[PROXY] ${message}`);
    log(message);
    clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    return;
  }

  let isAllowed = config.allowlist.some((pattern) =>
    wildcardMatch(pattern, hostname),
  );

  if (!isAllowed) {
    isAllowed = await getPermission(hostname);
  }

  if (isAllowed) {
    const message = `[HTTP] Allowing connection to ${hostname}:${port}`;
    console.log(`[PROXY] ${message}`);
    log(message);

    // Establish a TCP connection to the original destination.
    const serverSocket = net.connect(port, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      // Create a tunnel by piping data between the client and the destination server.
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
      const errorMessage = `[HTTP] Error connecting to destination: ${err.message}`;
      console.error(`[PROXY] ${errorMessage}`);
      log(errorMessage);
      clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n`);
    });
  } else {
    const message = `[HTTP] Denying connection to ${hostname}:${port} (not in allowlist)`;
    console.log(`[PROXY] ${message}`);
    log(message);
    clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  }

  clientSocket.on('error', (err) => {
    // This can happen if the client hangs up.
    const errorMessage = `[HTTP] Client socket error: ${err.message}`;
    console.error(`[PROXY] ${errorMessage}`);
    log(errorMessage);
  });
});

server.listen(PROXY_PORT, () => {
  const address = server.address();
  const message = `HTTP/HTTPS Proxy listening on ${address.address}:${address.port}`;
  console.log(`[PROXY] ${message}`);
  log(message);
  console.log(`[PROXY] Using configuration from: ${CONFIG_PATH}`);
});

// SOCKS5 Proxy
const srv = socks.createServer(async function (info, accept, deny) {
  const initialMessage = `[SOCKS5] Intercepted connection for: ${info.dstAddr}:${info.dstPort}`;
  console.log(`[PROXY] ${initialMessage}`);
  log(initialMessage);

  const isDenied = config.denylist.some((pattern) =>
    wildcardMatch(pattern, info.dstAddr),
  );
  if (isDenied) {
    const message = `[SOCKS5] Denying connection to ${info.dstAddr}:${info.dstPort} (denylisted)`;
    console.log(`[PROXY] ${message}`);
    log(message);
    deny();
    return;
  }

  let isAllowed = config.allowlist.some((pattern) =>
    wildcardMatch(pattern, info.dstAddr),
  );
  if (!isAllowed) {
    isAllowed = await getPermission(info.dstAddr);
  }

  if (isAllowed) {
    const message = `[SOCKS5] Allowing connection to ${info.dstAddr}:${info.dstPort}`;
    console.log(`[PROXY] ${message}`);
    log(message);
    accept();
  } else {
    const message = `[SOCKS5] Denying connection to ${info.dstAddr}:${info.dstPort} (not in allowlist)`;
    console.log(`[PROXY] ${message}`);
    log(message);
    deny();
  }
});

srv.listen(SOCKS_PORT, 'localhost', function () {
  const message = `SOCKS5 proxy server listening on port ${SOCKS_PORT}`;
  console.log(`[PROXY] ${message}`);
  log(message);
});

srv.useAuth(socks.auth.None());
