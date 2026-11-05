/**
 * Live-reload dev loop for the Expo **web** build.
 *
 * Why this exists: `npx expo start --web` needs Metro's file watcher, and on
 * this project's drive (FAT32, ~50k files under node_modules) that watcher
 * never finishes starting — the dev server comes up but every bundle request
 * fails with a DependencyGraph error. `expo export` does not use the watcher,
 * so this script exports on demand and re-exports when a source file changes.
 *
 *   node dev-web.mjs                     # build, serve on :8081, rebuild on save
 *   PORT=8081 API_URL=http://localhost:8000 node dev-web.mjs
 *
 * Each build is written to a fresh timestamped directory **outside** the Expo
 * project root (`../.web-dev/build-<ts>`). Two reasons:
 *   1. FAT32 refuses the export's own cleanup of an existing output directory
 *      (ENOTEMPTY / EPERM), and a fresh directory avoids that path entirely.
 *   2. Expo scans the project root while exporting; a build directory inside
 *      it gets crawled and can fail with EPERM on binary vendor assets.
 *
 * After a rebuild finishes, refresh the browser.
 */
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, statSync, existsSync, watch, rmSync, readdirSync } from 'node:fs';
import { extname, join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = join(__dirname, '..', '.web-dev');
const PORT = parseInt(process.env.PORT || '8081', 10);
const API_URL = process.env.API_URL || 'http://localhost:8000';
const WATCH_DIRS = ['app', 'components', 'lib'];
const BUILD_PREFIX = 'build-';

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

/** Directory currently being served; null until the first build lands. */
let currentRoot = null;
let building = false;
let pending = false;

/** Remove a tree, falling back to `rd /s /q` where rmSync can't (FAT32). */
function removeTree(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    spawnSync('cmd', ['/c', 'rd', '/s', '/q', dir], { stdio: 'ignore' });
  }
}

function removeOldBuilds(keep) {
  let entries = [];
  try {
    entries = readdirSync(OUT_ROOT, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(BUILD_PREFIX)) continue;
    const full = join(OUT_ROOT, entry.name);
    if (full === keep) continue;
    removeTree(full);
  }
}

function exportWeb() {
  if (building) {
    pending = true;
    return;
  }
  building = true;
  const outName = `${BUILD_PREFIX}${Date.now()}`;
  const outDir = join(OUT_ROOT, outName);
  const started = Date.now();
  console.log(`\n[build] exporting web -> ${relative(__dirname, outDir)} (API: ${API_URL}) ...`);

  const child = spawn(
    'npx',
    ['expo', 'export', '--platform', 'web', '--output-dir', relative(__dirname, outDir)],
    {
      cwd: __dirname,
      shell: true,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, EXPO_PUBLIC_API_URL: API_URL },
    },
  );

  child.on('exit', (code) => {
    building = false;
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (code === 0 && existsSync(join(outDir, 'index.html'))) {
      currentRoot = outDir;
      removeOldBuilds(outDir);
      console.log(`[build] done in ${secs}s — refresh the browser`);
    } else {
      console.log(`[build] FAILED (exit ${code}) — keeping the previous build`);
    }
    if (pending) {
      pending = false;
      exportWeb();
    }
  });
}

let timer = null;
function scheduleRebuild(file) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    console.log(`[watch] change: ${relative(__dirname, file)}`);
    exportWeb();
  }, 500);
}

for (const dir of WATCH_DIRS) {
  const abs = join(__dirname, dir);
  if (!existsSync(abs)) continue;
  try {
    watch(abs, { recursive: true }, (_event, file) => {
      if (file && /\.(tsx?|jsx?|json)$/.test(file)) scheduleRebuild(join(abs, file));
    });
    console.log(`[watch] ${dir}/`);
  } catch (err) {
    console.error(`[watch] cannot watch ${dir}/: ${err.message}`);
  }
}

const server = createServer((req, res) => {
  if (!currentRoot) {
    res.writeHead(503, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    res.end('Building the web app — reload in a moment.\n');
    return;
  }
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';
  const filePath = join(currentRoot, url);
  if (!filePath.startsWith(currentRoot)) {
    res.writeHead(403).end('403 Forbidden');
    return;
  }
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // Always re-fetch so a rebuild is visible on refresh.
      'Cache-Control': 'no-store',
    });
    res.end(readFileSync(filePath));
    return;
  }
  const index = join(currentRoot, 'index.html');
  if (existsSync(index)) {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    res.end(readFileSync(index));
    return;
  }
  res.writeHead(404).end('404 Not Found');
});

removeOldBuilds(null);
exportWeb();
server.listen(PORT, () => {
  console.log(`\n  Fiber360 web dev  ->  http://localhost:${PORT}/`);
  console.log('  Edit app/, components/ or lib/ and the export re-runs automatically.\n');
});
