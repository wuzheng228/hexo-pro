'use strict';

const fs = require('fs');
const path = require('path');
const { createHash, randomUUID } = require('crypto');
const { ensureDocumentId, findDocument, parseRaw, moveDocumentIdentity } = require('./document_identity');

const queues = new Map();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = (message, code = 'INVALID_DOCUMENT_UPDATE', statusCode = 400) => Object.assign(new Error(message), { code, statusCode });
const revisionFor = raw => createHash('sha256').update(raw).digest('hex');

// Reject symlinks in every existing component, including a missing target's parents.
function resolveSource(hexo, source) {
  if (typeof source !== 'string' || !source || /[\\\0]/.test(source) || path.isAbsolute(source)
      || /^[a-z]:/i.test(source) || source.split('/').some(part => !part || part === '.' || part === '..')) {
    throw invalid('文章路径必须位于 source 目录内', 'INVALID_DOCUMENT_PATH');
  }
  const root = path.resolve(hexo.source_dir);
  const target = path.resolve(root, source);
  if (!target.startsWith(root + path.sep)) throw invalid('文章路径超出 source 目录', 'INVALID_DOCUMENT_PATH');
  const rootStat = fs.lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw invalid('文章目录不能是符号链接', 'INVALID_DOCUMENT_PATH');
  let cursor = root;
  for (const part of source.split('/')) {
    cursor = path.join(cursor, part);
    try {
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink()) throw invalid('文章路径不能经过符号链接', 'INVALID_DOCUMENT_PATH');
      if (cursor !== target && !stat.isDirectory()) throw invalid('文章的上级路径不是目录', 'INVALID_DOCUMENT_PATH');
      if (cursor === target && !stat.isFile()) throw invalid('文章路径不是普通文件', 'INVALID_DOCUMENT_PATH');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}

function validateRename(kind, previous, source) {
  if (!/\.(md|markdown)$/i.test(source)) throw invalid('文章文件名需要以 .md 或 .markdown 结尾', 'INVALID_DOCUMENT_PATH');
  const before = previous.split('/')[0], after = source.split('/')[0];
  if (kind === 'Post' ? !['_posts', '_drafts'].includes(before) || after !== before : after.startsWith('_')) {
    throw invalid('重命名不能改变文章的发布状态，请使用发布或撤回操作', 'DOCUMENT_STATE_CHANGE_DENIED', 403);
  }
}

function assertRevision(raw, baseRevision) {
  const currentRevision = revisionFor(raw);
  if (baseRevision !== undefined && (typeof baseRevision !== 'string' || !/^[a-f0-9]{64}$/i.test(baseRevision))) {
    throw invalid('baseRevision 必须是读取文章时返回的 SHA-256 版本');
  }
  if (baseRevision !== undefined && baseRevision.toLowerCase() !== currentRevision) {
    throw Object.assign(invalid('文章已被其他操作修改，请重新读取并合并后保存', 'REVISION_CONFLICT', 409), { currentRevision });
  }
  return currentRevision;
}

function atomicWrite(hexo, source, data, { exclusive = false, mode = 0o600 } = {}) {
  const target = resolveSource(hexo, source);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  resolveSource(hexo, source);
  const temporary = path.join(path.dirname(target), `.hexopro-${randomUUID()}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', mode);
    fs.writeFileSync(descriptor, data);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor); descriptor = undefined;
    resolveSource(hexo, source);
    // link refuses to overwrite a target that appeared after validation.
    if (exclusive) fs.linkSync(temporary, target);
    else fs.renameSync(temporary, target);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
  return target;
}

function withDocumentLock(hexo, kind, reference, operation) {
  let documentId;
  try {
    const decoded = decodeURIComponent(reference);
    if (UUID.test(decoded)) documentId = decoded.toLowerCase();
    else {
      const document = findDocument(hexo, kind, reference);
      if (!document) throw invalid('文章不存在', 'DOCUMENT_NOT_FOUND', 404);
      documentId = ensureDocumentId(hexo, document);
    }
  } catch (error) { return Promise.reject(error); }
  const key = `${path.resolve(hexo.source_dir)}:${kind}:${documentId}`;
  const previous = queues.get(key) || Promise.resolve();
  const result = previous.catch(() => {}).then(() => operation(documentId));
  queues.set(key, result);
  const cleanup = () => { if (queues.get(key) === result) queues.delete(key); };
  result.then(cleanup, cleanup);
  return result;
}

function withRevision(hexo, document) {
  if (!document) return document;
  const raw = fs.readFileSync(resolveSource(hexo, document.source));
  const parsed = parseRaw(raw.toString('utf8'));
  return { ...document, raw: raw.toString('utf8'), _content: parsed._content, title: parsed.title, revision: revisionFor(raw) };
}

function readDocument(hexo, kind, reference) {
  return withDocumentLock(hexo, kind, reference, documentId => {
    const document = findDocument(hexo, kind, documentId);
    if (!document) throw invalid('文章不存在', 'DOCUMENT_NOT_FOUND', 404);
    return withRevision(hexo, document);
  });
}

function sendDocumentError(res, error, fallback = 400) {
  return res.send(error.statusCode || fallback, {
    code: error.code || error.statusCode || fallback,
    message: error.message || String(error), msg: error.message || String(error),
    ...(error.currentRevision ? { currentRevision: error.currentRevision } : {}),
  });
}

function movePost(hexo, reference, targetDirectory, baseRevision) {
  if (!['_posts', '_drafts'].includes(targetDirectory)) return Promise.reject(invalid('文章状态不正确'));
  return withDocumentLock(hexo, 'Post', reference, async documentId => {
    const post = findDocument(hexo, 'Post', documentId);
    if (!post) throw invalid('文章不存在', 'DOCUMENT_NOT_FOUND', 404);
    const previous = resolveSource(hexo, post.source);
    const raw = fs.readFileSync(previous);
    assertRevision(raw, baseRevision);
    if (post.source.startsWith(targetDirectory + '/')) return withRevision(hexo, post);
    const filename = path.basename(post.source);
    let source = `${targetDirectory}/${filename}`;
    if (fs.existsSync(resolveSource(hexo, source))) {
      const extension = path.extname(filename);
      source = `${targetDirectory}/${path.basename(filename, extension)} (${randomUUID().slice(0, 8)})${extension}`;
    }
    atomicWrite(hexo, source, raw, { exclusive: true, mode: fs.statSync(previous).mode & 0o777 });
    try {
      fs.unlinkSync(resolveSource(hexo, post.source));
      moveDocumentIdentity(hexo, 'Post', post.source, source, documentId, raw.toString('utf8'));
    } catch (error) {
      atomicWrite(hexo, post.source, raw);
      fs.unlinkSync(resolveSource(hexo, source));
      throw error;
    }
    await hexo.source.process();
    return withRevision(hexo, findDocument(hexo, 'Post', documentId));
  });
}

function validateFilename(value) {
  if (typeof value !== 'string' || !value.trim() || /[\\/\0]/.test(value) || ['.', '..'].includes(value.trim())) {
    throw invalid('文件名称不能包含路径分隔符或相对路径', 'INVALID_DOCUMENT_PATH');
  }
  return value.trim();
}

module.exports = { invalid, revisionFor, resolveSource, validateRename, assertRevision, atomicWrite, withDocumentLock, withRevision, readDocument, sendDocumentError, movePost, validateFilename };
