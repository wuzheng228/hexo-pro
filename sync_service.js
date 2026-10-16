const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { resolveTool } = require('./process-tools');
const { SOURCE_SYNC_IGNORE, withSourceSyncIgnore } = require('./source_sync');

const DEFAULT_BRANCH = 'main';
const DEFAULT_SYNC_IGNORE = SOURCE_SYNC_IGNORE;

function normalizeRepository(repository) {
  if (!repository) return '';
  return String(repository)
    .trim()
    .replace(/^https:\/\/github\.com\//, '')
    .replace(/^git@github\.com:/, '')
    .replace(/\.git$/, '')
    .replace(/^\/+|\/+$/g, '');
}

function buildPublicRepoUrl(repository) {
  const normalized = normalizeRepository(repository);
  if (!normalized) return '';
  return `https://github.com/${normalized}.git`;
}

function buildAuthenticatedRepoUrl(repository, accessToken) {
  const normalized = normalizeRepository(repository);
  if (!normalized || !accessToken) return '';
  return `https://x-access-token:${encodeURIComponent(accessToken)}@github.com/${normalized}.git`;
}

function maskSyncConfig(config = {}) {
  const { oauth, ...publicConfig } = config;
  return {
    ...publicConfig,
    githubToken: config.githubToken ? '******' : '',
    hasGithubToken: Boolean(config.githubToken)
  };
}

function parseGitStatus(output) {
  const files = String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(2).trim())
    .filter(Boolean);

  return {
    dirty: files.length > 0,
    files
  };
}

function createSyncService(baseDir, options = {}) {
  const configPath = options.configPath || path.join(baseDir, 'sync_config.json');

  function readConfig() {
    const defaults = {
      repository: '',
      branch: DEFAULT_BRANCH,
      commitMessage: 'Sync blog: {{ now }}',
      gitUserName: 'Hexo Pro',
      gitUserEmail: 'hexo-pro@users.noreply.github.com',
      githubToken: '',
      lastSyncTime: ''
    };

    if (!fs.existsSync(configPath)) return defaults;

    try {
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return {
        ...defaults,
        ...saved,
        githubToken: saved.githubToken || (saved.oauth && saved.oauth.accessToken) || ''
      };
    } catch (error) {
      return defaults;
    }
  }

  function saveConfig(nextConfig) {
    const existing = readConfig();
    const merged = {
      ...existing,
      ...nextConfig,
      repository: normalizeRepository(nextConfig.repository || existing.repository),
      branch: nextConfig.branch || existing.branch || DEFAULT_BRANCH,
      githubToken: nextConfig.githubToken === undefined ? existing.githubToken : nextConfig.githubToken
    };

    if (nextConfig.githubToken === '******') {
      merged.githubToken = existing.githubToken;
    }

    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.chmodSync(configPath, 0o600);
    return merged;
  }

  return {
    baseDir,
    configPath,
    readConfig,
    saveConfig
  };
}

function processCommitMessage(template) {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const formatted = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return String(template || 'Sync blog: {{ now }}').replace(/\{\{\s*now\s*\}\}/g, formatted);
}

function runCommandDefault(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { timeout = 90000, ...spawnOptions } = options;
    const resolved = resolveTool(command, args, options.env || process.env);
    const proc = spawn(resolved.command, resolved.args, {
      ...spawnOptions,
      windowsHide: true,
      shell: false,
      windowsVerbatimArguments: false
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { proc.kill('SIGTERM'); reject(new Error('连接 GitHub 超时，请检查网络后重试')); }, timeout);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        const error = new Error((stderr || stdout || `命令执行失败，退出码: ${code}`).trim());
        error.stdout = stdout;
        error.stderr = stderr;
        error.code = code;
        reject(error);
      }
    });
    proc.on('error', error => { clearTimeout(timer); reject(error); });
  });
}

async function writeSyncIgnore(baseDir) {
  const ignorePath = path.join(baseDir, '.gitignore');
  let current = '';
  if (fs.existsSync(ignorePath)) {
    current = fs.readFileSync(ignorePath, 'utf-8');
  }

  fs.writeFileSync(ignorePath, withSourceSyncIgnore(current), 'utf-8');
}

module.exports = {
  DEFAULT_BRANCH,
  DEFAULT_SYNC_IGNORE,
  normalizeRepository,
  buildPublicRepoUrl,
  buildAuthenticatedRepoUrl,
  maskSyncConfig,
  parseGitStatus,
  createSyncService,
  processCommitMessage,
  runCommandDefault,
  writeSyncIgnore
};
