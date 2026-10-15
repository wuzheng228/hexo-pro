"use strict";

const fs = require('fs');
const moment = require('moment');
const hfm = require('hexo-front-matter');
const { ensureDocumentId, findDocument, parseRaw, moveDocumentIdentity } = require('./document_identity');
const { invalid, resolveSource, validateRename, assertRevision, atomicWrite, withDocumentLock, revisionFor } = require('./document_write');

const RESERVED = new Set(['__proto__', 'prototype', 'constructor', '_id', 'documentId', 'source', 'full_source', 'raw', 'revision', 'baseRevision', 'isDraft', 'isDiscarded']);
const FIELDS = new Set(['title', 'date', 'tags', 'categories', '_content', 'author', 'permalink', 'source', 'frontMatter', 'frontMatterStyles', 'baseRevision']);

function validateUpdate(update, metadata = {}) {
  if (!update || typeof update !== 'object' || Array.isArray(update)) throw invalid('文章更新必须是字段对象');
  const allowed = new Set([...FIELDS, ...Object.keys(metadata).filter(key => !RESERVED.has(key))]);
  for (const key of Object.keys(update)) if (!allowed.has(key)) throw invalid(`不允许修改文章字段：${key}`);
  for (const field of ['title', '_content', 'author', 'permalink', 'source']) {
    if (update[field] !== undefined && typeof update[field] !== 'string') throw invalid(`${field} 必须是文本`);
  }
  for (const field of ['frontMatter', 'frontMatterStyles']) {
    if (update[field] === undefined) continue;
    if (!update[field] || typeof update[field] !== 'object' || Array.isArray(update[field])) throw invalid(`${field} 必须是字段对象`);
    for (const key of Object.keys(update[field])) if (RESERVED.has(key)) throw invalid(`不允许修改文章字段：${key}`);
  }
  return update;
}

function applyFrontMatterStyles(raw, compiled, styles) {
  if (!styles) return raw;
  const lines = raw.split('\n');
  const endIndex = lines.indexOf('---', 1);
  for (const [key, style] of Object.entries(styles)) {
    if (!['single', 'double'].includes(style) || typeof compiled[key] !== 'string') continue;
    const matcher = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s.*$`);
    const value = style === 'double' ? JSON.stringify(compiled[key]) : `'${compiled[key].replace(/'/g, "''")}'`;
    for (let i = 1; i < endIndex; i++) if (matcher.test(lines[i])) { lines[i] = `${key}: ${value}`; break; }
  }
  return lines.join('\n');
}

async function writeDocument(model, reference, input, hexo) {
  validateUpdate(input, hexo.config.metadata);
  return withDocumentLock(hexo, model, reference, async documentId => {
    // Read after earlier saves finish, including a preceding rename.
    const document = findDocument(hexo, model, documentId);
    if (!document) throw invalid('文章不存在', 'DOCUMENT_NOT_FOUND', 404);
    ensureDocumentId(hexo, document);
    const previousSource = document.source;
    const previousPath = resolveSource(hexo, previousSource);
    const previous = fs.readFileSync(previousPath);
    assertRevision(previous, input.baseRevision);
    const source = input.source === undefined ? previousSource : input.source;
    const target = resolveSource(hexo, source);
    const renamed = source !== previousSource;
    if (renamed) {
      validateRename(model, previousSource, source);
      if (fs.existsSync(target)) throw invalid('目标文件已存在，请修改文件名', 'DOCUMENT_PATH_CONFLICT', 409);
    }
    const compiled = parseRaw(previous.toString('utf8'));
    const preserved = ['title', 'date', 'tags', 'categories', '_content', 'author', 'permalink'];
    for (const key of [...preserved, ...Object.keys(hexo.config.metadata || {})]) {
      if (Object.prototype.hasOwnProperty.call(input, key)) compiled[key] = input[key];
    }
    if (input.frontMatter) {
      for (const [key, value] of Object.entries(input.frontMatter)) compiled[key] = value;
      for (const key of Object.keys(compiled)) {
        if (!preserved.includes(key) && !Object.prototype.hasOwnProperty.call(input.frontMatter, key)) delete compiled[key];
      }
    }
    if (compiled.date) compiled.date = moment(compiled.date).toDate();
    const raw = applyFrontMatterStyles(hfm.stringify(compiled, { prefixSeparator: true }), compiled, input.frontMatterStyles);
    const mode = fs.statSync(previousPath).mode & 0o777;
    // Commit the file and identity before updating the Hexo model.
    atomicWrite(hexo, source, raw, { exclusive: renamed, mode });
    try {
      if (renamed) fs.unlinkSync(resolveSource(hexo, previousSource));
      moveDocumentIdentity(hexo, model, previousSource, source, documentId, raw);
    } catch (error) {
      // An index failure must not strand the original ID at a deleted path.
      atomicWrite(hexo, previousSource, previous, { mode });
      if (renamed) fs.unlinkSync(resolveSource(hexo, source));
      throw error;
    }
    await hexo.source.process();
    const saved = findDocument(hexo, model, documentId);
    if (!saved) throw invalid('文件已保存，但 Hexo 尚未完成索引，请重新加载', 'DOCUMENT_INDEX_PENDING', 503);
    return { ...saved, revision: revisionFor(Buffer.from(raw)) };
  });
}

module.exports = function update(model, reference, input, callback, hexo) {
  writeDocument(model, reference, input, hexo).then(document => callback(null, document), error => callback(error, null));
};
module.exports.validateUpdate = validateUpdate;
module.exports.writeDocument = writeDocument;
