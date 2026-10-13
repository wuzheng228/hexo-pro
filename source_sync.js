'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const yaml = require('js-yaml');

const IDENTITY_PATH = '.hexo-pro/document-identities.json';
const SOURCE_SYNC_IGNORE = [
  'node_modules/', '/public/', '/.deploy*/', '/.deploy_git/', '/.hexopro_sync_git/',
  '.DS_Store', 'Thumbs.db', '.env', '.env.*', '*.log',
  '/db.json', '/blogInfoList.json', '/deploy_config.json', '/sync_config.json', '/_admin-config.yml',
  '/data/*.db', '/data/*.db~', '/data/*_cache.db',
  '/.wrangler/', '/.edgeone/', '/.vercel/', '/.netlify/',
  '!/.hexo-pro/', '/.hexo-pro/*', `!/${IDENTITY_PATH}`
];

function withSourceSyncIgnore(original, publicRelative = 'public') {
  const start = '# Hexo Pro source sync: begin';
  const end = '# Hexo Pro source sync: end';
  const current = original.replace(/^# Hexo Pro source sync: begin\r?\n[\s\S]*?^# Hexo Pro source sync: end(?:\r?\n|$)/gm, '');
  const escapedPublic = publicRelative.replace(/[\\*?\[\]]/g, '\\$&');
  const rules = [...SOURCE_SYNC_IGNORE.filter(rule => rule !== '/public/' || publicRelative === 'public'), `/${escapedPublic}/`];
  return current.replace(/(?:\r?\n)*$/, '') + '\n\n' + start + '\n' + rules.join('\n') + '\n' + end + '\n';
}

function isLocalOnly(relative, publicRelative) {
  const parts = relative.split('/');
  const name = parts.at(-1);
  if (parts.some(part => ['.git', 'node_modules', '.DS_Store', 'Thumbs.db'].includes(part))) return true;
  if (/^\.env(?:\.|$)/.test(name) || /\.log$/i.test(name)) return true;
  if (relative === publicRelative || relative.startsWith(publicRelative + '/')) return true;
  if (/^(?:\.deploy[^/]*|\.hexopro_sync_git|\.wrangler|\.edgeone|\.vercel|\.netlify)(?:\/|$)/.test(relative)) return true;
  if (/^(?:db\.json|blogInfoList\.json|deploy_config\.json|sync_config\.json|_admin-config\.yml)$/.test(relative)) return true;
  if (/^data\/.*\.db~?$/.test(relative)) return true;
  return relative.startsWith('.hexo-pro/') && relative !== IDENTITY_PATH;
}

// Git evaluates nested ignore files, escaped names and negated patterns for us.
function ignoredFiles(baseDir, gitDir, files) {
  if (!files.length) return Promise.resolve(new Set());
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['--git-dir', gitDir, '--work-tree', baseDir,
      'check-ignore', '--no-index', '-z', '--stdin'], { cwd: baseDir, shell: false });
    const output = [];
    child.stdout.on('data', chunk => output.push(chunk));
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0 && code !== 1) return reject(new Error('无法读取项目的 Git 忽略规则，源码上传已停止'));
      resolve(new Set(Buffer.concat(output).toString('utf8').split('\0').filter(Boolean)));
    });
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error); });
    child.stdin.end(files.join('\0') + '\0');
  });
}

function cleanHexoConfig(text) {
  let config;
  try { config = yaml.load(text); }
  catch { throw new Error('_config.yml 无法解析，请修复配置后再上传源码'); }
  let changed = false;
  const clean = value => {
    if (typeof value === 'string') {
      const result = value.replace(/(https?:\/\/)[^/\s@]+@/gi, '$1');
      if (result !== value) changed = true;
      return result;
    }
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        if (/^(?:token|password|accessToken|apiToken)$/i.test(key)) { delete value[key]; changed = true; }
        else value[key] = clean(value[key]);
      }
    }
    return value;
  };
  if (config?.deploy) config.deploy = clean(config.deploy);
  return changed ? yaml.dump(config) : text;
}

async function copySourceProject(baseDir, deployDir, { publicDir = path.join(baseDir, 'public') } = {}) {
  baseDir = path.resolve(baseDir);
  deployDir = path.resolve(deployDir);
  const publicRelative = path.relative(baseDir, path.resolve(publicDir)).split(path.sep).join('/');
  if (!publicRelative || publicRelative === '..' || publicRelative.startsWith('../')) {
    throw new Error('生成目录必须是博客项目内的独立目录，源码上传已停止');
  }
  const entries = [];
  async function walk(directory, prefix = '') {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      const source = path.join(directory, entry.name);
      if (source === deployDir || isLocalOnly(relative, publicRelative)) continue;
      if (entry.isDirectory()) await walk(source, relative + '/');
      else if (entry.isFile() || entry.isSymbolicLink()) entries.push({ relative, source, link: entry.isSymbolicLink() });
    }
  }
  await walk(baseDir);
  const ignored = await ignoredFiles(baseDir, path.join(deployDir, '.git'), entries.map(entry => entry.relative));
  const selected = entries.filter(entry => !ignored.has(entry.relative)
    || entry.relative === IDENTITY_PATH || entry.relative === '.gitignore');

  // Read and validate configuration before copying, with no unsafe fallback to the original credentials.
  const config = selected.find(entry => entry.relative === '_config.yml');
  if (config?.link) throw new Error('_config.yml 必须是普通文件，源码上传已停止');
  const cleanConfig = config && !config.link ? cleanHexoConfig(await fs.readFile(config.source, 'utf8')) : null;
  for (const entry of selected) {
    const destination = path.join(deployDir, entry.relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    if (entry.link) {
      const target = await fs.readlink(entry.source);
      const resolved = path.resolve(path.dirname(entry.source), target);
      const relativeTarget = path.relative(baseDir, resolved).split(path.sep).join('/');
      if (relativeTarget === '..' || relativeTarget.startsWith('../') || isLocalOnly(relativeTarget, publicRelative)
        || ignored.has(relativeTarget)) throw new Error(`链接指向项目外或已排除的文件，源码上传已停止：${entry.relative}`);
      const targetInCopy = path.join(deployDir, relativeTarget);
      await fs.symlink(path.isAbsolute(target) ? path.relative(path.dirname(destination), targetInCopy) : target, destination);
    } else if (entry.relative === '_config.yml') await fs.writeFile(destination, cleanConfig);
    else await fs.copyFile(entry.source, destination);
  }
  const ignorePath = path.join(deployDir, '.gitignore');
  const original = selected.some(entry => entry.relative === '.gitignore') ? await fs.readFile(ignorePath, 'utf8') : '';
  await fs.writeFile(ignorePath, withSourceSyncIgnore(original, publicRelative));
  return selected.map(entry => entry.relative).concat(selected.some(entry => entry.relative === '.gitignore') ? [] : ['.gitignore']);
}

module.exports = { IDENTITY_PATH, SOURCE_SYNC_IGNORE, withSourceSyncIgnore, copySourceProject, ignoredFiles };
