/**
 * Serve the Expo Web build output locally.
 *
 * Usage:
 *   node serve-web.mjs            # serves build_output/ on port 8081
 *   PORT=3000 node serve-web.mjs  # custom port
 *
 * The server:
 *   - Serves static files from the build_output/ directory
 *   - Falls back to index.html for client-side routing (SPA)
 *   - Logs every request with timestamp and status code
 */

import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = process.argv[2] || 'build_output';
const PORT = parseInt(process.argv[3] || process.env.PORT || '8081', 10);
const ROOT = join(__dirname, BUILD_DIR);

const MIME_TYPES = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.map':  'application/json',
};

function serveFile(res, filePath) {
  try {
    const content = readFileSync(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

function log(req, status, extra = '') {
  const ts = new Date().toISOString().slice(11, 19);
  const method = req.method.padEnd(6);
  console.log(`[${ts}] ${method} ${status} ${req.url}${extra ? ' ' + extra : ''}`);
}

const server = createServer((req, res) => {
  let url = req.url.split('?')[0]; // strip query params

  // Default to index.html for root
  if (url === '/') url = '/index.html';

  const filePath = join(ROOT, url);

  // Path traversal guard — ensure resolved path stays within ROOT
  if (!filePath.startsWith(ROOT)) {
    log(req, 403, '(path traversal blocked)');
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  // Serve the exact file if it exists
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    if (serveFile(res, filePath)) {
      log(req, 200);
      return;
    }
  }

  // SPA fallback: serve index.html for non-file routes
  const indexPath = join(ROOT, 'index.html');
  if (existsSync(indexPath)) {
    try {
      const content = readFileSync(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
      log(req, 200, `(SPA fallback: ${url})`);
      return;
    } catch {
      // fall through to 404
    }
  }

  log(req, 404);
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
});

server.listen(PORT, () => {
  console.log(`\n  🗺️  Fiber360 Web App\n`);
  console.log(`  Local:   http://localhost:${PORT}/\n`);
  console.log(`  Serving: ${ROOT}\n`);
  console.log(`  Press Ctrl+C to stop\n`);
});
