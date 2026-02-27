import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import http from 'http';

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    console.log(`[${req.method}] ${req.url}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    if (req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: {}\n\n');
    }
  });
});

server.listen(0, async () => {
  const port = server.address().port;

  const transport = new StreamableHTTPClientTransport(
    new URL(`http://localhost:${port}/mcp`),
    {
      requestInit: {
        headers: {
          Accept: 'application/json, text/event-stream',
        },
      },
    },
  );

  const client = new Client(
    { name: 'test', version: '1.0' },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);
  } catch (err) {
  } finally {
    server.close();
    process.exit(0);
  }
});
