/**
 * Simple local test server to verify the redirects.json logic.
 * Run: node test-redirects.js
 * Then open: http://localhost:3333/terms  or  http://localhost:3333/privacy
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load redirects from docs/redirects.json
const redirectsPath = path.join(__dirname, 'docs', 'redirects.json');
const redirects = JSON.parse(fs.readFileSync(redirectsPath, 'utf8'));

// Serve docs markdown as simple HTML for testing
function serveMarkdownAsHtml(filePath, res) {
  const docsRoot = path.join(__dirname, 'docs');
  const fullPath = path.join(docsRoot, filePath + '.md');
  const indexPath = path.join(docsRoot, filePath, 'index.md');
  const mdPath = fs.existsSync(fullPath) ? fullPath
    : fs.existsSync(indexPath) ? indexPath
    : null;

  if (mdPath) {
    const content = fs.readFileSync(mdPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Gemini CLI Docs - ${filePath}</title>
          <style>
            body { font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; }
            pre { background: #f4f4f4; padding: 12px; border-radius: 4px; overflow-x: auto; }
            a { color: #1a73e8; }
          </style>
        </head>
        <body>
          <p><a href="/">&larr; Home</a></p>
          <pre>${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        </body>
      </html>
    `);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`404: Page not found for path "${filePath}"`);
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  // Check if there's a redirect for this path
  if (redirects[pathname]) {
    const target = redirects[pathname];
    console.log(`[REDIRECT] ${pathname} → ${target}`);
    res.writeHead(302, { Location: target });
    res.end();
    return;
  }

  // Serve docs pages
  if (pathname === '/') {
    // Show a simple index listing the redirects
    const rows = Object.entries(redirects)
      .map(([from, to]) => `<tr><td><a href="${from}">${from}</a></td><td>${to}</td></tr>`)
      .join('\n');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Redirect Test Server</title>
          <style>
            body { font-family: sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #ddd; }
            th { background: #f0f0f0; }
            a { color: #1a73e8; }
            h1 { color: #202124; }
            .test { background: #e8f5e9; padding: 12px 16px; border-radius: 6px; margin: 16px 0; }
          </style>
        </head>
        <body>
          <h1>🔗 Redirect Test Server</h1>
          <div class="test">
            <strong>Test these footer links (from issue #29363):</strong><br/>
            &bull; <a href="/terms">/terms</a> → should redirect to /docs/resources/tos-privacy<br/>
            &bull; <a href="/privacy">/privacy</a> → should redirect to /docs/resources/tos-privacy
          </div>
          <h2>All Redirects (from docs/redirects.json)</h2>
          <table>
            <thead><tr><th>From</th><th>To</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `);
    return;
  }

  // Serve markdown page
  if (pathname.startsWith('/docs/')) {
    const docPath = pathname.replace(/^\/docs\//, '');
    serveMarkdownAsHtml('/' + docPath, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end(`404 - No page found for "${pathname}"`);
});

const PORT = 3333;
server.listen(PORT, () => {
  console.log(`\n✅ Test server running at http://localhost:${PORT}\n`);
  console.log('Test the footer links:');
  console.log(`  /terms   → http://localhost:${PORT}/terms`);
  console.log(`  /privacy → http://localhost:${PORT}/privacy`);
  console.log('\nPress Ctrl+C to stop.\n');
});
