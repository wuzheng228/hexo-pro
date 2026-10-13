'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_BASE_URL = 'http://127.0.0.1:8081';
const DEFAULT_CANDIDATE_PORTS = [8081, 8001, 4000, 3000, 3001, 5173];
const RUNTIME_RELATIVE_PATH = path.join('.hexo-pro', 'runtime.json');

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function getFetch(fetchImpl) {
  if (fetchImpl) return fetchImpl;
  if (globalThis.fetch) return globalThis.fetch.bind(globalThis);
  throw new Error('This command needs Node.js 18+ or a fetch implementation.');
}

function globalRuntimeFile() {
  return path.join(os.homedir(), '.hexo-pro', 'runtime.json');
}

function blogRuntimeFile(baseDir) {
  return path.join(baseDir, RUNTIME_RELATIVE_PATH);
}

function findRuntimeFiles(options = {}) {
  const env = options.env || process.env;
  const files = [];

  if (env.HEXO_PRO_RUNTIME_FILE) {
    files.push(env.HEXO_PRO_RUNTIME_FILE);
  }

  const baseDir = env.HEXOPRO_BASE_DIR || env.HEXO_BLOG_PATH;
  if (baseDir) {
    files.push(blogRuntimeFile(path.resolve(baseDir)));
  }

  files.push(globalRuntimeFile());

  return Array.from(new Set(files));
}

function readRuntimeFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const runtime = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!runtime || !runtime.baseUrl) return null;

    if (runtime.pid) {
      try {
        process.kill(runtime.pid, 0);
      } catch (error) {
        return null;
      }
    }

    return {
      ...runtime,
      baseUrl: normalizeBaseUrl(runtime.baseUrl),
      runtimeFile: filePath
    };
  } catch (error) {
    return null;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeRuntimeFile(options) {
  const baseDir = path.resolve(options.baseDir);
  const runtime = {
    mode: options.mode || 'server',
    baseUrl: normalizeBaseUrl(options.baseUrl),
    apiBase: `${normalizeBaseUrl(options.baseUrl)}/hexopro/api`,
    serverUrl: normalizeBaseUrl(options.serverUrl || options.baseUrl),
    pid: options.pid || process.pid,
    startedAt: options.startedAt || new Date().toISOString(),
    blogBaseDir: baseDir
  };

  const files = [blogRuntimeFile(baseDir), globalRuntimeFile()];
  files.forEach((filePath) => {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(runtime, null, 2));
  });

  return runtime;
}

async function probeBaseUrl(baseUrl, fetchImpl) {
  const fetch = getFetch(fetchImpl);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), 600)
    : null;

  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/hexopro/api/auth/status`, {
      method: 'GET',
      signal: controller ? controller.signal : undefined
    });
    return response && response.ok;
  } catch (error) {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function resolveBaseUrl(options = {}) {
  const env = options.env || process.env;

  if (options.baseUrl) {
    return { baseUrl: normalizeBaseUrl(options.baseUrl), source: 'options.baseUrl' };
  }
  if (env.HEXO_PRO_BASE_URL) {
    return { baseUrl: normalizeBaseUrl(env.HEXO_PRO_BASE_URL), source: 'HEXO_PRO_BASE_URL' };
  }
  if (env.HEXOPRO_BASE_URL) {
    return { baseUrl: normalizeBaseUrl(env.HEXOPRO_BASE_URL), source: 'HEXOPRO_BASE_URL' };
  }

  const port = env.HEXO_PRO_AGENT_PORT || env.HEXOPRO_AGENT_PORT;
  if (port) {
    return { baseUrl: `http://127.0.0.1:${port}`, source: 'agent-port-env' };
  }

  const runtimeFiles = Array.isArray(options.runtimeFiles)
    ? options.runtimeFiles
    : findRuntimeFiles({ env });
  for (const filePath of runtimeFiles) {
    const runtime = readRuntimeFile(filePath);
    if (runtime && runtime.baseUrl) {
      return { baseUrl: runtime.baseUrl, source: 'runtime', runtime };
    }
  }

  const candidatePorts = options.candidatePorts || DEFAULT_CANDIDATE_PORTS;
  for (const candidatePort of candidatePorts) {
    const candidateUrl = `http://127.0.0.1:${candidatePort}`;
    if (await probeBaseUrl(candidateUrl, options.fetchImpl)) {
      return { baseUrl: candidateUrl, source: 'probe' };
    }
  }

  return { baseUrl: DEFAULT_BASE_URL, source: 'default' };
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_CANDIDATE_PORTS,
  RUNTIME_RELATIVE_PATH,
  blogRuntimeFile,
  findRuntimeFiles,
  globalRuntimeFile,
  normalizeBaseUrl,
  probeBaseUrl,
  readRuntimeFile,
  resolveBaseUrl,
  writeRuntimeFile
};
