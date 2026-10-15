#!/usr/bin/env node
'use strict';

require('./node-runtime').assertSupportedNode();

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { createRequire } = require('module');

function writeRuntimeFile(options) {
  const baseDir = path.resolve(options.baseDir);
  const baseUrl = String(options.baseUrl || '').replace(/\/+$/, '');
  const runtime = {
    mode: options.mode || 'headless',
    baseUrl,
    apiBase: `${baseUrl}/hexopro/api`,
    serverUrl: String(options.serverUrl || baseUrl).replace(/\/+$/, ''),
    pid: options.pid || process.pid,
    startedAt: options.startedAt || new Date().toISOString(),
    blogBaseDir: baseDir
  };
  [
    path.join(baseDir, '.hexo-pro', 'runtime.json'),
    path.join(os.homedir(), '.hexo-pro', 'runtime.json')
  ].forEach((filePath) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(runtime, null, 2));
  });
  return runtime;
}

const blogPath = path.resolve(
  process.env.HEXOPRO_BASE_DIR || process.env.HEXO_BLOG_PATH || process.cwd()
);

function ensureRuntime(baseDir) {
  if (!fs.existsSync(baseDir)) {
    throw new Error(`Blog path does not exist: ${baseDir}`);
  }

  process.chdir(baseDir);

  const localBin = path.join(baseDir, 'node_modules', '.bin');
  process.env.PATH = process.env.PATH
    ? `${localBin}${path.delimiter}${process.env.PATH}`
    : localBin;
}

function getProjectHexo(baseDir) {
  const requireFromProject = createRequire(path.join(baseDir, 'package.json'));
  return requireFromProject('hexo');
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(startPort) {
  const explicit = Number(startPort || 0);
  if (explicit > 0 && await isPortAvailable(explicit)) return explicit;
  for (let port = 8787; port < 8887; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error('No available local port for Hexo Pro headless server.');
}

async function start() {
  ensureRuntime(blogPath);

  const Hexo = getProjectHexo(blogPath);
  const hexo = new Hexo(blogPath, { cache: false });

  await hexo.init();
  await hexo.load();

  const port = await findAvailablePort(process.env.HEXO_PRO_HEADLESS_PORT || process.env.HEXOPRO_HEADLESS_PORT);
  await hexo.call('server', {
    port,
    ip: '127.0.0.1',
    open: false,
    watch: false,
    draft: false,
    log: false
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  writeRuntimeFile({
    baseDir: hexo.base_dir,
    baseUrl,
    serverUrl: baseUrl,
    mode: 'headless'
  });

  console.log(`Hexo Pro headless server is running at ${baseUrl}`);
}

start().catch((error) => {
  console.error('[Hexo Pro Headless]: failed to start:', error);
  process.exit(1);
});
