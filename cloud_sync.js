'use strict';

// Cloud sync owns a private checkout. The user's Git branch, index and remotes are never changed.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const yaml = require('js-yaml');
const { copySourceProject, IDENTITY_PATH, ignoredFiles } = require('./source_sync');
const { normalizeRepository, runCommandDefault, processCommitMessage } = require('./sync_service');

const hash = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => a?.hash === b?.hash && a?.mode === b?.mode;
const fail = message => Object.assign(new Error(message), { statusCode: 409 });
const metadata = files => Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)).map(([name, file]) => [name, { hash: file.hash, mode: file.mode }]));
const stable = value => JSON.stringify(value, Object.keys(value || {}).sort());
const sameBytes = (a, b) => (!a && !b) || Boolean(a && b && a.mode === b.mode && a.bytes.equals(b.bytes));

function parseIdentities(bytes) {
  const value = bytes ? JSON.parse(String(bytes)) : { version: 1, documents: [] };
  if (value.version !== 1 || !Array.isArray(value.documents)) throw fail('文章 ID 索引格式不正确，请先修复索引');
  const ids = new Set(), sources = new Set();
  for (const record of value.documents) {
    const key = `${record.kind}:${record.source}`;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.documentId)
      || !['Post', 'Page'].includes(record.kind) || typeof record.source !== 'string' || !record.source
      || typeof record.fingerprint !== 'string' || ids.has(record.documentId) || sources.has(key)) throw fail('文章 ID 索引存在无效或重复记录，请先修复索引');
    ids.add(record.documentId); sources.add(key);
  }
  return value;
}

function mergeIdentities(base, local, remote) {
  try {
    const parse = bytes => {
      const value = parseIdentities(bytes);
      const records = new Map(value.documents.map(record => [record.documentId, record]));
      if (records.size !== value.documents.length) throw new Error('Duplicate ID');
      return records;
    };
    const b = parse(base), l = parse(local), r = parse(remote), merged = [];
    for (const id of new Set([...b.keys(), ...l.keys(), ...r.keys()])) {
      const bv = b.get(id), lv = l.get(id), rv = r.get(id);
      const eq = (a, c) => stable(a) === stable(c);
      const value = eq(lv, rv) ? lv : eq(lv, bv) ? rv : eq(rv, bv) ? lv : undefined;
      if (!eq(lv, rv) && !eq(lv, bv) && !eq(rv, bv)) return null;
      if (value) merged.push(value);
    }
    if (new Set(merged.map(v => `${v.kind}:${v.source}`)).size !== merged.length) return null;
    return Buffer.from(JSON.stringify({ version: 1, documents: merged }, null, 2) + '\n');
  } catch { return null; }
}

function makePlan(base, local, remote, identityRaw, mode = 'sync') {
  const changes = [];
  for (const name of new Set([...Object.keys(base || {}), ...local.keys(), ...remote.keys()])) {
    const l = local.get(name), r = remote.get(name), b = base?.[name];
    if (same(l, r)) continue;
    let direction;
    if (mode === 'restore') direction = 'download';
    else if (!base) direction = !r ? 'upload' : !l ? 'download' : 'conflict';
    else direction = same(l, b) ? 'download' : same(r, b) ? 'upload' : 'conflict';
    let merged;
    if (direction === 'conflict' && name === IDENTITY_PATH && l && r) {
      const bytes = mergeIdentities(identityRaw, l.bytes, r.bytes);
      if (bytes) { direction = 'merge'; merged = { bytes, hash: hash(bytes), mode: '100644' }; }
    }
    changes.push({ path: name, direction, localExists: Boolean(l), remoteExists: Boolean(r), merged });
  }
  return changes.sort((a, b) => (a.direction === 'conflict' ? -1 : 0) - (b.direction === 'conflict' ? -1 : 0) || a.path.localeCompare(b.path));
}

function createCloudSync(baseDir, options = {}) {
  baseDir = path.resolve(baseDir);
  const runCommand = options.runCommand || runCommandDefault;
  const publicDir = options.publicDir || path.join(baseDir, 'public');
  let pending;

  function validate(config) {
    const repository = normalizeRepository(config.repository);
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw fail('请填写 owner/repo 格式的 GitHub 仓库');
    if (!config.githubToken || config.githubToken === '******') throw fail('请先填写并保存 GitHub 访问凭据');
    if (!/^[\x21-\x7e]+$/.test(config.githubToken)) throw fail('GitHub 访问凭据格式不正确，请粘贴完整令牌');
    const branch = config.branch || 'main';
    if (!branch || branch.startsWith('-')) throw fail('同步分支格式不正确');
    return { ...config, repository, branch };
  }

  function context(config) {
    const root = path.join(baseDir, '.hexo-pro', 'cloud-sync', hash(`${config.repository}:${config.branch}`).slice(0, 20));
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`x-access-token:${config.githubToken}`).toString('base64')}`,
      GIT_CONFIG_KEY_1: 'credential.helper', GIT_CONFIG_VALUE_1: '' };
    const git = async (cwd, args) => {
      try { return await runCommand('git', args, { cwd, env }); }
      catch (error) {
        let message = String(error.message).split(config.githubToken).join('[已隐藏凭据]');
        message = message.split(env.GIT_CONFIG_VALUE_0.slice(21)).join('[已隐藏凭据]');
        if (/Authentication failed|could not read Username|Invalid username|403|401/.test(message)) message = 'GitHub 凭据无效或没有仓库权限，请检查令牌的仓库授权与 Contents 读写权限';
        else if (/Repository not found/.test(message)) message = '找不到 GitHub 仓库，请检查仓库名称和令牌的访问权限';
        throw fail(message);
      }
    };
    return { root, remoteDir: path.join(root, 'remote'), stateFile: path.join(root, 'state.json'), git };
  }

  async function readState(file) {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw fail('同步记录无法读取，请先恢复本机同步记录'); }
  }

  async function openRemote(config, ctx) {
    await fs.mkdir(ctx.remoteDir, { recursive: true, mode: 0o700 });
    await ctx.git(ctx.remoteDir, ['check-ref-format', '--branch', config.branch]);
    await ctx.git(ctx.remoteDir, ['init']);
    const url = `https://github.com/${config.repository}.git`;
    try { await ctx.git(ctx.remoteDir, ['remote', 'get-url', 'origin']); }
    catch { await ctx.git(ctx.remoteDir, ['remote', 'add', 'origin', url]); }
    await ctx.git(ctx.remoteDir, ['remote', 'set-url', 'origin', url]);
    const refs = await ctx.git(ctx.remoteDir, ['ls-remote', '--heads', 'origin']);
    const head = refs.split(/\r?\n/).find(line => line.split('\t')[1] === `refs/heads/${config.branch}`)?.split('\t')[0] || null;
    if (!head && refs.trim()) throw fail(`没有找到分支 ${config.branch}，请填写手机使用的同一分支`);
    return head;
  }

  async function snapshot(directory, destination, ctx, restoreRemote = false) {
    await fs.mkdir(destination, { recursive: true });
    await ctx.git(destination, ['init']);
    let relativePublic = path.relative(baseDir, publicDir);
    if (restoreRemote) {
      const configFile = path.join(directory, '_config.yml');
      if ((await fs.lstat(configFile).catch(() => null))?.isFile()) {
        const settings = yaml.load(await fs.readFile(configFile, 'utf8'));
        relativePublic = settings?.public_dir || 'public';
      }
    }
    // The freshly fetched checkout contains tracked files only. Its ignore rules
    // must not hide tracked themes/configuration during an authoritative restore.
    const names = await copySourceProject(directory, destination, {
      publicDir: path.resolve(directory, relativePublic), respectGitIgnore: !restoreRemote
    });
    const files = new Map();
    for (const name of names) {
      const file = path.join(destination, name), stat = await fs.lstat(file);
      const bytes = stat.isSymbolicLink() ? Buffer.from(await fs.readlink(file)) : await fs.readFile(file);
      if (name === IDENTITY_PATH) parseIdentities(bytes);
      let compared = bytes;
      if (name === '_config.yml') {
        const settings = yaml.load(bytes.toString());
        if (settings && typeof settings === 'object') { delete settings.deploy; compared = yaml.dump(settings, { sortKeys: true }); }
      }
      files.set(name, { bytes, hash: hash(compared), mode: stat.isSymbolicLink() ? '120000' : stat.mode & 0o111 ? '100755' : '100644' });
    }
    return files;
  }

  async function check(config) {
    config = validate(config);
    const ctx = context(config);
    const head = await openRemote(config, ctx);
    return { connected: true, repository: config.repository, branch: config.branch, emptyRepository: !head };
  }

  async function refreshRemote(config, ctx, head) {
    if (head) {
      await ctx.git(ctx.remoteDir, ['fetch', '--depth', '1', 'origin', `refs/heads/${config.branch}`]);
      await ctx.git(ctx.remoteDir, ['reset', '--hard', 'FETCH_HEAD']);
      head = await ctx.git(ctx.remoteDir, ['rev-parse', 'HEAD']);
    } else {
      await fs.rm(ctx.remoteDir, { recursive: true, force: true });
      await fs.mkdir(ctx.remoteDir, { recursive: true, mode: 0o700 });
      await ctx.git(ctx.remoteDir, ['init']);
      await ctx.git(ctx.remoteDir, ['remote', 'add', 'origin', `https://github.com/${config.repository}.git`]);
    }
    await ctx.git(ctx.remoteDir, ['clean', '-fdx']);
    return head;
  }

  async function preview(config, mode = 'sync') {
    if (!['sync', 'restore'].includes(mode)) throw fail('请选择双向同步或从 GitHub 恢复');
    config = validate(config);
    const ctx = context(config);
    await fs.mkdir(ctx.root, { recursive: true, mode: 0o700 });
    if (await readState(path.join(ctx.root, 'recovery.json'))) throw fail('上一次同步中断，本机原文件备份仍保留在 .hexo-pro/cloud-sync 中，请先恢复后再同步');
    if (pending) { await fs.rm(pending.directory, { recursive: true, force: true }); pending = null; }
    const head = await refreshRemote(config, ctx, await openRemote(config, ctx));
    // Clean only the app-owned checkout; never the user's blog directory.
    const directory = await fs.mkdtemp(path.join(ctx.root, 'preview-'));
    try {
      const local = await snapshot(baseDir, path.join(directory, 'local'), ctx);
      const remote = head ? await snapshot(ctx.remoteDir, path.join(directory, 'remote'), ctx, mode === 'restore') : new Map();
      if (mode === 'restore') {
        if (!head) throw fail('GitHub 仓库还是空的，没有可以恢复的博客');
        let manifest;
        try { manifest = JSON.parse(remote.get('package.json')?.bytes.toString()); } catch { /* Report a source-repository error below. */ }
        if (!remote.has('_config.yml') || !(manifest?.dependencies?.hexo || manifest?.devDependencies?.hexo)) {
          throw fail('请选择包含 _config.yml 和 Hexo package.json 的源码仓库或分支，不能从网站发布目录恢复');
        }
      } else {
        const excluded = await ignoredFiles(baseDir, path.join(directory, 'local', '.git'), [...remote.keys()]);
        for (const name of excluded) if (name !== IDENTITY_PATH && name !== '.gitignore') remote.delete(name);
      }
      const state = await readState(ctx.stateFile);
      const changes = makePlan(state?.files, local, remote, state?.identityRaw, mode);
      const indexChange = changes.find(change => change.path === IDENTITY_PATH);
      // A restore must never upload template files or rewrite the remote identity index.
      if (mode === 'sync' && indexChange?.direction !== 'conflict') {
        const currentIndex = indexChange?.merged || (indexChange?.direction === 'download' ? remote.get(IDENTITY_PATH) : local.get(IDENTITY_PATH)) || remote.get(IDENTITY_PATH);
        const identities = parseIdentities(currentIndex?.bytes);
        const known = new Set(identities.documents.map(record => record.source));
        const prefix = (options.sourceDir || 'source').replace(/\/$/, '') + '/';
        let added = false;
        // Bootstrap IDs for legacy remote articles too, so the first phone download shares the same IDs.
        for (const [name, file] of new Map([...remote, ...local])) {
          if (!name.startsWith(prefix) || !/\.(md|markdown)$/i.test(name) || file.mode === '120000') continue;
          const source = name.slice(prefix.length);
          if (/^_(?!posts\/|drafts\/)/.test(source) || known.has(source)) continue;
          identities.documents.push({ documentId: randomUUID(), kind: /^_(posts|drafts)\//.test(source) ? 'Post' : 'Page', source,
            fingerprint: hash(file.bytes.toString().replace(/\r\n/g, '\n')) });
          known.add(source); added = true;
        }
        if (added) {
          const bytes = Buffer.from(JSON.stringify(identities, null, 2) + '\n');
          const change = { path: IDENTITY_PATH, direction: 'merge', localExists: local.has(IDENTITY_PATH), remoteExists: remote.has(IDENTITY_PATH), merged: { bytes, hash: hash(bytes), mode: '100644' } };
          if (indexChange) Object.assign(indexChange, change); else changes.push(change);
        }
      }
      pending = { id: randomUUID(), config, ctx, directory, head, local, remote, changes, state, mode };
      return { id: pending.id, mode, firstSync: !state, repository: config.repository, branch: config.branch,
        localCount: local.size, remoteCount: remote.size,
        changes: changes.map(({ merged, ...change }) => change),
        uploadCount: changes.filter(c => c.direction === 'upload' || c.direction === 'merge').length,
        downloadCount: changes.filter(c => c.direction === 'download' || c.direction === 'merge').length,
        conflictCount: changes.filter(c => c.direction === 'conflict').length };
    } catch (error) { await fs.rm(directory, { recursive: true, force: true }); throw error; }
  }

  async function safeTarget(root, name) {
    const parts = name.split('/');
    if (parts.some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git' || part.includes('\\'))) throw fail('同步文件路径无效');
    let parent = root;
    for (const part of parts.slice(0, -1)) {
      parent = path.join(parent, part);
      try { if (!(await fs.lstat(parent)).isDirectory()) throw fail(`文件的上级路径不是普通目录：${name}`); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const target = path.join(root, name);
    try { if ((await fs.lstat(target)).isDirectory()) throw fail(`同名目录阻止同步：${name}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return target;
  }

  async function readOriginal(target) {
    try {
      const stat = await fs.lstat(target);
      return { bytes: stat.isSymbolicLink() ? Buffer.from(await fs.readlink(target)) : await fs.readFile(target),
        mode: stat.isSymbolicLink() ? '120000' : stat.mode & 0o111 ? '100755' : '100644' };
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }

  async function writeFile(root, name, value) {
    const target = await safeTarget(root, name);
    if (!value) { await fs.rm(target, { force: true }); return; }
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = target + `.hexopro-${randomUUID()}.tmp`;
    try {
      if (value.mode === '120000') await fs.symlink(value.bytes.toString(), temporary);
      else await fs.writeFile(temporary, value.bytes, { mode: value.mode === '100755' ? 0o755 : 0o644 });
      await fs.rename(temporary, target);
    } finally { await fs.rm(temporary, { force: true }); }
  }

  async function apply(config, id, resolutions = {}) {
    config = validate(config);
    const plan = pending;
    if (!plan || plan.id !== id || plan.config.repository !== config.repository || plan.config.branch !== config.branch || plan.config.githubToken !== config.githubToken) throw fail('同步预览已过期，请重新检查变更');
    const { ctx, local, remote, changes, directory } = plan;
    const uploads = new Map(), downloads = new Map(), nextRemote = new Map(remote);
    for (const change of changes) {
      const direction = change.direction === 'conflict' ? resolutions[change.path] : change.direction;
      if (!['upload', 'download', 'merge'].includes(direction)) throw fail('请为每个冲突文件选择保留本机或 GitHub 版本');
      const value = direction === 'merge' ? change.merged : direction === 'upload' ? local.get(change.path) : remote.get(change.path);
      if (direction !== 'download') { uploads.set(change.path, value); if (value) nextRemote.set(change.path, value); else nextRemote.delete(change.path); }
      if (direction !== 'upload') downloads.set(change.path, value);
    }
    const checkDir = path.join(directory, 'verify');
    await fs.rm(checkDir, { recursive: true, force: true });
    const latest = await snapshot(baseDir, checkDir, ctx);
    if (JSON.stringify(metadata(latest)) !== JSON.stringify(metadata(local))) throw fail('预览后本机文件发生了变化，请重新检查变更');
    if (JSON.stringify(await readState(ctx.stateFile)) !== JSON.stringify(plan.state)) throw fail('同步记录已改变，请重新检查变更');
    if (await openRemote(config, ctx) !== plan.head) throw fail('手机或其他设备刚更新了 GitHub，请重新检查变更；本机文件未被修改');
    if (await refreshRemote(config, ctx, plan.head) !== plan.head) throw fail('GitHub 刚有新的提交，请重新检查变更');

    // Validate every target and save original bytes before any published or local change.
    const originals = new Map();
    for (const [name] of downloads) {
      const target = await safeTarget(baseDir, name);
      originals.set(name, await readOriginal(target));
    }
    const backupDir = path.join(ctx.root, 'backups', new Date().toISOString().replace(/[:.]/g, '-') + '-' + id);
    for (const [name, value] of originals) if (value) await writeFile(backupDir, name, value);
    let lock;
    const lockPath = path.join(baseDir, IDENTITY_PATH + '.lock');
    const journal = path.join(ctx.root, 'recovery.json');
    try {
      if (downloads.has(IDENTITY_PATH)) {
        try { lock = await fs.open(lockPath, 'wx'); await lock.writeFile(String(process.pid)); }
        catch { throw fail('文章索引正在保存，请稍后重新检查变更'); }
      }
      pending = null;
      for (const [name, value] of uploads) await writeFile(ctx.remoteDir, name, value);
      let head = plan.head;
      if (uploads.size) {
        const names = [...uploads.keys()];
        for (let i = 0; i < names.length; i += 100) await ctx.git(ctx.remoteDir, ['add', '-f', '--', ...names.slice(i, i + 100)]);
        const staged = await ctx.git(ctx.remoteDir, ['diff', '--cached', '--name-only']);
        if (staged) {
          await ctx.git(ctx.remoteDir, ['-c', 'commit.gpgsign=false', '-c', `user.name=${config.gitUserName || 'Hexo Pro'}`,
            '-c', `user.email=${config.gitUserEmail || 'hexo-pro@users.noreply.github.com'}`, 'commit', '-m', processCommitMessage(config.commitMessage)]);
          await ctx.git(ctx.remoteDir, ['push', 'origin', `HEAD:refs/heads/${config.branch}`]);
          head = await ctx.git(ctx.remoteDir, ['rev-parse', 'HEAD']);
        }
      }
      if (downloads.size) {
        await fs.writeFile(journal, JSON.stringify({ backupDir, paths: [...originals].map(([name, value]) => ({ path: name, existed: Boolean(value) })) }, null, 2));
        const applied = new Map();
        try {
          for (const [name, value] of downloads) {
            const target = await safeTarget(baseDir, name);
            if (!sameBytes(await readOriginal(target), originals.get(name))) throw fail(`同步期间本机文件已被编辑，已保留你的修改，请重新检查变更：${name}`);
            let output = value;
            // Deployment settings belong to this computer, even when other Hexo settings change.
            if (name === '_config.yml' && value && originals.get(name)) {
              const incoming = yaml.load(value.bytes.toString());
              const existing = yaml.load(originals.get(name).bytes.toString());
              if (existing?.deploy) { incoming.deploy = existing.deploy; output = { ...value, bytes: Buffer.from(yaml.dump(incoming)) }; }
            }
            await writeFile(baseDir, name, output);
            applied.set(name, output);
          }
        } catch (error) {
          for (const [name, value] of applied) {
            // Roll back only our own writes; preserve edits made while the sync was running.
            if (sameBytes(await readOriginal(await safeTarget(baseDir, name)), value)) await writeFile(baseDir, name, originals.get(name));
          }
          await fs.rm(journal, { force: true });
          throw error;
        }
      }
      const state = { version: 1, head, files: metadata(nextRemote), identityRaw: nextRemote.get(IDENTITY_PATH)?.bytes.toString(), lastSyncTime: new Date().toISOString() };
      const temporary = ctx.stateFile + '.tmp';
      await fs.writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
      await fs.rename(temporary, ctx.stateFile);
      await fs.rm(journal, { force: true });
      pending = null;
      return { success: true, mode: plan.mode, uploaded: uploads.size, downloaded: downloads.size, lastSyncTime: state.lastSyncTime, backupDir: downloads.size ? backupDir : null };
    } finally { if (lock) { await lock.close(); await fs.rm(lockPath, { force: true }); } }
  }

  async function withLock(config, callback) {
    const ctx = context(validate(config));
    await fs.mkdir(ctx.root, { recursive: true, mode: 0o700 });
    const lockFile = path.join(ctx.root, 'operation.lock');
    let lock;
    try { lock = await fs.open(lockFile, 'wx'); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(await fs.readFile(lockFile, 'utf8'));
      if (!pid) throw fail('另一个服务正在准备同步，请稍后重试');
      try { process.kill(pid, 0); throw fail('另一个服务正在同步同一博客，请稍后重试'); }
      catch (running) { if (running.code !== 'ESRCH') throw running; }
      await fs.rm(lockFile); lock = await fs.open(lockFile, 'wx');
    }
    try { await lock.writeFile(String(process.pid)); return await callback(); }
    finally { await lock.close(); await fs.rm(lockFile, { force: true }); }
  }

  function diff(id, name) {
    if (!pending || pending.id !== id || !pending.changes.some(change => change.path === name)) throw fail('同步预览已过期，请重新检查变更');
    const content = file => {
      if (!file) return '（文件不存在）';
      if (file.bytes.length > 200000 || file.bytes.includes(0)) return '（此文件较大或为二进制文件，请在文件管理器中查看）';
      return file.bytes.toString('utf8');
    };
    return { path: name, local: content(pending.local.get(name)), remote: content(pending.remote.get(name)) };
  }

  return { check: config => withLock(config, () => check(config)), preview: (config, mode) => withLock(config, () => preview(config, mode)),
    apply: (config, id, choices) => withLock(config, () => apply(config, id, choices)), diff };
}

module.exports = { createCloudSync, makePlan, mergeIdentities };
