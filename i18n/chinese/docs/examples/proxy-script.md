[查看英文版](https://github.com/google-gemini/gemini-cli/blob/main/docs/examples/proxy-script.md)

# 示例代理脚本

以下是可与 `GEMINI_SANDBOX_PROXY_COMMAND` 环境变量一起使用的代理脚本示例。此脚本仅允许到 `example.com:443` 的 `HTTPS` 连接，并拒绝所有其他请求。

```javascript
#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 侦听 :::8877 并仅允许与 example.com 建立 HTTPS 连接的示例代理服务器。
// 设置 `GEMINI_SANDBOX_PROXY_COMMAND=scripts/example-proxy.js` 以与沙盒一起运行代理
// 通过沙盒内的 `curl https://example.com` 进行测试（在 shell 模式下或通过 shell 工具）

import http from 'http';
import net from 'net';
import { URL } from 'url';
import console from 'console';

const PROXY_PORT = 8877;
const ALLOWED_DOMAINS = ['example.com', 'googleapis.com'];
const ALLOWED_PORT = '443';

const server = http.createServer((req, res) => {
  // 拒绝除 HTTPS 的 CONNECT 之外的所有请求
  console.log(
    `[PROXY] Denying non-CONNECT request for: ${req.method} ${req.url}`,
  );
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.on('connect', (req, clientSocket, head) => {
  // 对于 CONNECT 请求，req.url 的格式为“hostname:port”。
  const { port, hostname } = new URL(`http://${req.url}`);

  console.log(`[PROXY] Intercepted CONNECT request for: ${hostname}:${port}`);

  if (
    ALLOWED_DOMAINS.some(
      (domain) => hostname == domain || hostname.endsWith(`.${domain}`),
    ) &&
    port === ALLOWED_PORT
  ) {
    console.log(`[PROXY] Allowing connection to ${hostname}:${port}`);

    // 与原始目标建立 TCP 连接。
    const serverSocket = net.connect(port, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      // 通过在客户端和目标服务器之间建立管道来创建隧道。
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
      console.error(`[PROXY] Error connecting to destination: ${err.message}`);
      clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n`);
    });
  } else {
    console.log(`[PROXY] Denying connection to ${hostname}:${port}`);
    clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  }

  clientSocket.on('error', (err) => {
    // 如果客户端挂断，可能会发生这种情况。
    console.error(`[PROXY] Client socket error: ${err.message}`);
  });
});

server.listen(PROXY_PORT, () => {
  const address = server.address();
  console.log(`[PROXY] Proxy listening on ${address.address}:${address.port}`);
  console.log(
    `[PROXY] Allowing HTTPS connections to domains: ${ALLOWED_DOMAINS.join(', ')}`,
  );
});
```
