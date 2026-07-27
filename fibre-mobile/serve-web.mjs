#!/usr/bin/env node

/**
 * Expo Web Static Server
 * 
 * Serves the built web app with SPA routing support.
 * No external dependencies - uses only Node.js built-in modules.
 * 
 * HTML fixes (DOM warning suppression) are handled by patch-html.mjs
 * at build time, not at serve time.
 * 
 * Usage:
 *   node serve-web.mjs                    # serves web-prod/ on port 8081
 *   node serve-web.mjs ./dist  3000       # custom directory and port
 *   node serve-web.mjs --build            # also rebuilds before serving
 *   node serve-web.mjs --build --port 9090
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Configuration ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);

let buildDir = path.join(__dirname, 'web-prod');
let PORT = 8081;
let shouldBuild = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--build' || args[i] === '-b') {
    shouldBuild = true;
  } else if (args[i] === '--port' || args[i] === '-p') {
    PORT = parseInt(args[++i], 10);
  } else if (/^\d+$/.test(args[i])) {
    PORT = parseInt(args[i], 10);
  } else if (!args[i].startsWith('--') && fs.existsSync(args[i]) && fs.statSync(args[i]).isDirectory()) {
    buildDir = path.resolve(args[i]);
  }
}

// ── MIME types ────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.map':  'application/json',
};

// ── Minimal transparent favicon (1×1 px PNG) ──────────────────────────────
const FAVICON_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAjR9awAAAABJRU5ErkJggg==',
  'base64'
);

// ── Server ────────────────────────────────────────────────────────────────
function serve() {
  const indexPath = path.join(buildDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.error(`\n  ❌ No index.html found in ${buildDir}`);
    console.error(`     Run: npx expo export --platform web --output-dir ${path.basename(buildDir)}`);
    console.error(`     Or:  node serve-web.mjs --build\n`);
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    const reqPath = new URL(req.url, `http://${req.headers.host}`).pathname;

    // ── Favicon handler (eliminates 404) ──
    if (reqPath === '/favicon.ico') {
      res.writeHead(200, {
        'Content-Type': 'image/x-icon',
        'Content-Length': FAVICON_BUFFER.length,
        'Cache-Control': 'public, max-age=86400',
      });
      res.end(FAVICON_BUFFER);
      return;
    }

    // ── Static file serving ──
    const safePath = path.normalize(reqPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.join(buildDir, safePath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      serveFile(filePath, res);
    } else {
      // SPA fallback: serve index.html for all non-file routes
      if (fs.existsSync(indexPath)) {
        serveFile(indexPath, res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  ❌ Port ${PORT} is already in use.`);
      console.error('     Kill the existing process or use a different port:');
      console.error(`     node serve-web.mjs --port ${PORT + 1}\n`);
    } else {
      console.error(`\n  ❌ Server error: ${err.message}\n`);
    }
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log('');
    console.log('  ┌─────────────────────────────────────────────────────┐');
    console.log(`  │  🌐  Expo Web Server Running                         │`);
    console.log(`  │                                                     │`);
    console.log(`  │  ➜  Local:   http://localhost:${PORT}/                │`);
    console.log(`  │  ➜  Build:   ${buildDir}  │`);
    console.log(`  │  ➜  SPA:     ✓ (all routes → index.html)           │`);
    console.log(`  │  ➜  Favicon: ✓ (inline, no 404)                    │`);
    console.log('  └─────────────────────────────────────────────────────┘');
    console.log('');
  });
}

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  try {
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': ext === '.js' || ext === '.css'
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}

// ── Build helper ──────────────────────────────────────────────────────────
function runBuild() {
  console.log('\n  📦  Building web export...\n');
  execSync(`npx expo export --platform web --output-dir "${buildDir}"`, {
    cwd: __dirname,
    stdio: 'inherit',
  });
  // Apply HTML patches after build
  console.log('  🔧  Applying HTML patches...');
  execSync(`node "${path.join(__dirname, 'patch-html.mjs')}" "${path.join(buildDir, 'index.html')}"`, {
    stdio: 'inherit',
  });
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  if (shouldBuild) {
    try {
      runBuild();
    } catch (err) {
      console.error('\n  ❌ Build failed:', err.message);
      process.exit(1);
    }
  }
  serve();
}

main();
