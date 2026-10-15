'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { resolveBaseUrl, probeBaseUrl } = require('./base-url-resolver');

const DEFAULT_HEADLESS_PORT = '8787';

function isTruthyEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getHeadlessScriptPath() {
  const packageRoot = path.resolve(__dirname, '..');
  const candidates = [
    path.join(packageRoot, 'headless_server.js'),
    path.join(packageRoot, 'hexo-pro', 'headless_server.js')
  ];
  const scriptPath = candidates.find(file => fs.existsSync(file));
  if (!scriptPath) {
    throw new Error('Hexo Pro headless server is missing. Reinstall the hexo-pro package before using auto start.');
  }
  return scriptPath;
}

function registerChildCleanup(child) {
  const cleanup = () => {
    if (child && !child.killed) {
      try {
        child.kill();
      } catch (error) {
        // best effort cleanup
      }
    }
  };
  process.once('exit', cleanup);
  process.once('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });
}

function spawnHeadlessServer(options = {}) {
  const env = options.env || process.env;
  const spawnImpl = options.spawnImpl || spawn;
  const scriptPath = options.scriptPath || getHeadlessScriptPath();
  const child = spawnImpl(process.execPath, [scriptPath], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      ...env,
      HEXO_PRO_HEADLESS_PORT: env.HEXO_PRO_HEADLESS_PORT || env.HEXOPRO_HEADLESS_PORT || DEFAULT_HEADLESS_PORT
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (child && child.stdout && typeof child.stdout.on === 'function') {
    child.stdout.on('data', data => process.stderr.write(`[hexo-pro-headless] ${data}`));
  }
  if (child && child.stderr && typeof child.stderr.on === 'function') {
    child.stderr.on('data', data => process.stderr.write(`[hexo-pro-headless] ${data}`));
  }
  if (!options.disableCleanup && child && typeof child.kill === 'function') {
    registerChildCleanup(child);
  }

  return child;
}

async function ensureHexoProRuntime(options = {}) {
  const env = options.env || process.env;
  const resolveBaseUrlImpl = options.resolveBaseUrlImpl || resolveBaseUrl;
  const healthCheckImpl = options.healthCheckImpl || probeBaseUrl;
  const waitMs = options.waitMs || sleep;
  const maxAttempts = options.maxAttempts || 30;
  const intervalMs = options.intervalMs || 500;

  const resolved = await resolveBaseUrlImpl({
    env,
    fetchImpl: options.fetchImpl,
    candidatePorts: options.candidatePorts
  });

  if (await healthCheckImpl(resolved.baseUrl, options.fetchImpl)) {
    return { ...resolved, started: false };
  }

  const autoStart = isTruthyEnv(env.HEXO_PRO_AUTO_START || env.HEXOPRO_AUTO_START);
  if (!autoStart) {
    throw new Error(
      `Hexo Pro is not running at ${resolved.baseUrl}. Start Hexo Pro first or set HEXO_PRO_AUTO_START=true with HEXOPRO_BASE_DIR.`
    );
  }

  if (!env.HEXOPRO_BASE_DIR && !env.HEXO_BLOG_PATH) {
    throw new Error('HEXO_PRO_AUTO_START=true requires HEXOPRO_BASE_DIR or HEXO_BLOG_PATH.');
  }

  spawnHeadlessServer(options);

  const headlessPort = env.HEXO_PRO_HEADLESS_PORT || env.HEXOPRO_HEADLESS_PORT || DEFAULT_HEADLESS_PORT;
  const headlessUrl = `http://127.0.0.1:${headlessPort}`;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await healthCheckImpl(headlessUrl, options.fetchImpl)) {
      return { baseUrl: headlessUrl, source: 'headless', started: true };
    }
    await waitMs(intervalMs);
  }

  throw new Error(`Hexo Pro headless server did not become ready at ${headlessUrl}.`);
}

module.exports = {
  DEFAULT_HEADLESS_PORT,
  ensureHexoProRuntime,
  getHeadlessScriptPath,
  isTruthyEnv,
  spawnHeadlessServer
};
