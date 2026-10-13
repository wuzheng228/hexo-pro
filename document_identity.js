'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID, createHash } = require('crypto');
const hfm = require('hexo-front-matter');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stores = new Map();
const normalizeSource = source => String(source || '').replace(/\\/g, '/');
const recordKey = (kind, source) => `${kind}:${normalizeSource(source)}`;
const storePath = hexo => path.join(hexo.base_dir, '.hexo-pro', 'document-identities.json');
const identityError = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });

function parseRaw(raw) {
  return hfm.parse(String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'));
}

function stamp(file) {
  try {
    const stat = fs.statSync(file);
    return `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function getStore(hexo) {
  const file = storePath(hexo);
  const currentStamp = stamp(file);
  const cached = stores.get(file);
  if (cached && cached.stamp === currentStamp) return cached;
  let records = [];
  if (currentStamp) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data.version !== 1 || !Array.isArray(data.documents)) throw new Error('Unsupported identity index');
      const ids = new Set(), sources = new Set();
      for (const record of data.documents) {
        const key = recordKey(record.kind, record.source);
        if (!UUID.test(record.documentId) || !['Post', 'Page'].includes(record.kind)
            || !record.source || typeof record.fingerprint !== 'string'
            || ids.has(record.documentId) || sources.has(key)) throw new Error('Invalid or duplicate identity');
        ids.add(record.documentId);
        sources.add(key);
      }
      records = data.documents;
    } catch {
      throw identityError(`文章身份索引损坏：${file}。请修复该文件或从 .bak 备份恢复，避免重新生成 ID`);
    }
  } else if (cached || fs.existsSync(file + '.bak')) {
    throw identityError(`文章身份索引丢失：${file}。请恢复索引文件，避免原有编辑链接失效`);
  }
  const store = { file, stamp: currentStamp, records, raw: new Map() };
  stores.set(file, store);
  return store;
}

function saveStore(store, records) {
  fs.mkdirSync(path.dirname(store.file), { recursive: true });
  const lockPath = store.file + '.lock';
  let lock;
  try { lock = fs.openSync(lockPath, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner;
    try { owner = Number(fs.readFileSync(lockPath, 'utf8')); } catch {}
    let alive = true;
    if (owner > 0) {
      try { process.kill(owner, 0); }
      catch (e) { alive = e.code !== 'ESRCH'; }
    }
    if (alive) throw identityError('另一个服务正在更新文章身份索引，请稍后重试');
    fs.unlinkSync(lockPath);
    lock = fs.openSync(lockPath, 'wx');
  }
  const temporary = store.file + `.${process.pid}.tmp`;
  try {
    fs.writeFileSync(lock, String(process.pid));
    if (stamp(store.file) !== store.stamp) throw identityError('文章身份索引已被另一服务更新，请重试');
    const data = JSON.stringify({ version: 1, documents: records }, null, 2) + '\n';
    const descriptor = fs.openSync(temporary, 'w');
    try { fs.writeFileSync(descriptor, data); fs.fsyncSync(descriptor); }
    finally { fs.closeSync(descriptor); }
    fs.copyFileSync(store.stamp ? store.file : temporary, store.file + '.bak');
    fs.renameSync(temporary, store.file);
    store.records = records;
    store.stamp = stamp(store.file);
  } finally {
    fs.closeSync(lock);
    fs.rmSync(lockPath, { force: true });
    fs.rmSync(temporary, { force: true });
  }
}

function fingerprint(raw) {
  return createHash('sha256').update(String(raw).replace(/\r\n/g, '\n')).digest('hex');
}

function sourceRaw(hexo, document) {
  return typeof document.raw === 'string' ? document.raw
    : fs.readFileSync(path.join(hexo.source_dir, document.source), 'utf8');
}

function prepareDocumentIds(hexo) {
  const store = getStore(hexo);
  const records = store.records.map(record => ({ ...record }));
  const bySource = new Map(records.map(record => [recordKey(record.kind, record.source), record]));
  const live = ['Post', 'Page'].flatMap(kind => hexo.model(kind).toArray().map(document => ({ kind, document })));
  const liveKeys = new Set(live.map(({ kind, document }) => recordKey(kind, document.source)));
  const rawCache = new Map(store.raw);
  const pending = [];
  let changed = false;
  for (const { kind, document } of live) {
    const key = recordKey(kind, document.source);
    const raw = sourceRaw(hexo, document);
    let record = bySource.get(key);
    // A model can briefly refer to the old location while Hexo processes a
    // move. Never register a ghost article for a file that no longer exists.
    if (!record && !fs.existsSync(path.join(hexo.source_dir, document.source))) continue;
    if (record && store.raw.get(key) === raw) continue;
    const digest = fingerprint(raw);
    if (record) {
      if (record.fingerprint !== digest) { record.fingerprint = digest; changed = true; }
    } else pending.push({ kind, source: normalizeSource(document.source), fingerprint: digest });
    rawCache.set(key, raw);
  }
  // Recognize an external rename only when both sides are unambiguous and the
  // old file is gone. Copying an article always creates a separate identity.
  for (const item of pending) {
    const candidates = records.filter(record => record.kind === item.kind && record.fingerprint === item.fingerprint
      && !liveKeys.has(recordKey(record.kind, record.source))
      && !fs.existsSync(path.join(hexo.source_dir, record.source)));
    const siblings = pending.filter(other => other.kind === item.kind && other.fingerprint === item.fingerprint);
    if (candidates.length === 1 && siblings.length === 1) candidates[0].source = item.source;
    else records.push({ documentId: randomUUID(), ...item });
    changed = true;
  }
  if (changed) saveStore(store, records);
  store.raw = rawCache;
  return store;
}

function lookupDocumentId(hexo, document, kind) {
  const source = normalizeSource(document.source);
  const record = getStore(hexo).records.find(record => record.source === source && (!kind || record.kind === kind));
  return record ? record.documentId : null;
}

function ensureDocumentId(hexo, document) {
  const existing = lookupDocumentId(hexo, document);
  if (existing) return existing;
  prepareDocumentIds(hexo);
  const id = lookupDocumentId(hexo, document);
  if (!id) throw identityError('文章未被索引，请刷新文章列表', 404);
  return id;
}

function moveDocumentIdentity(hexo, kind, oldSource, newSource, documentId, raw) {
  const store = getStore(hexo);
  const record = store.records.find(record => record.kind === kind && record.source === normalizeSource(oldSource));
  if (!record || record.documentId !== documentId) throw identityError('文章身份索引与当前文件不一致，请重新打开文章');
  const target = store.records.find(item => item.kind === kind && item.source === normalizeSource(newSource) && item !== record);
  // Callers move with overwrite:false, or explicitly handle restore conflicts.
  // Check that the move has completed before reassigning an abandoned path.
  if (normalizeSource(oldSource) !== normalizeSource(newSource) && fs.existsSync(path.join(hexo.source_dir, oldSource))) {
    throw identityError('文件尚未完成移动，请稍后重试');
  }
  // A removed target's UUID must never resolve to the replacement article.
  const records = store.records.filter(item => item !== target).map(item => item === record
    ? { ...record, source: normalizeSource(newSource), fingerprint: fingerprint(raw === undefined
      ? fs.readFileSync(path.join(hexo.source_dir, newSource), 'utf8') : raw) } : item);
  saveStore(store, records);
  store.raw.delete(recordKey(kind, oldSource));
  if (raw !== undefined) store.raw.set(recordKey(kind, newSource), raw);
}

function assignNewDocumentId(hexo, kind, document) {
  const store = getStore(hexo);
  const source = normalizeSource(document.source);
  const raw = sourceRaw(hexo, document);
  const documentId = randomUUID();
  const records = store.records.filter(record => recordKey(record.kind, record.source) !== recordKey(kind, source));
  records.push({ kind, source, documentId, fingerprint: fingerprint(raw) });
  saveStore(store, records);
  store.raw.set(recordKey(kind, source), raw);
  return documentId;
}

function decodeReference(reference) {
  if (typeof reference !== 'string' || !reference) throw identityError('缺少文章标识', 400);
  let value;
  try { value = decodeURIComponent(reference); }
  catch { throw identityError('文章标识格式不正确', 400); }
  if (UUID.test(value) || /^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw identityError('文章标识格式不正确', 400);
  return Buffer.from(value, 'base64').toString('utf8');
}

function urlPath(value) {
  try {
    if (!/^https?:\/\//i.test(value) && !value.startsWith('/')) return null;
    return decodeURI(new URL(value, 'https://hexopro.invalid').pathname);
  } catch { return null; }
}

function findDocument(hexo, model, reference) {
  const value = decodeReference(reference);
  const documents = hexo.model(model).toArray();
  let matches;
  if (UUID.test(value)) {
    const store = prepareDocumentIds(hexo);
    const record = store.records.find(record => record.kind === model && record.documentId === value.toLowerCase());
    matches = record ? documents.filter(document => normalizeSource(document.source) === record.source) : [];
  } else {
    matches = documents.filter(document => document.permalink === value);
    if (!matches.length) {
      const legacyPath = urlPath(value);
      if (legacyPath) matches = documents.filter(document => urlPath(document.permalink) === legacyPath);
    }
  }
  if (matches.length > 1) throw identityError('文章标识匹配了多个文件，请从文章列表重新打开并检查重复链接');
  return matches[0] || null;
}

module.exports = { storePath, lookupDocumentId, ensureDocumentId, prepareDocumentIds, moveDocumentIdentity, assignNewDocumentId, findDocument, parseRaw };
