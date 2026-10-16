'use strict';

const _ = require('lodash');
const updateAny = require('./update');
const { createHermesConfig } = require('./mcp_config');
const { ensureDocumentId, findDocument, assignNewDocumentId } = require('./document_identity');
const { withRevision, readDocument, resolveSource, sendDocumentError, movePost: movePostFile, validateFilename, invalid } = require('./document_write');
const updatePostFile = updateAny.bind(null, 'Post');
const {
  DEFAULT_MCP_SCOPES,
  createMcpToken,
  publicMcpSettings,
  verifyMcpToken
} = require('./mcp_token');

function promisifyDb(db, method, ...args) {
  return new Promise((resolve, reject) => {
    db[method](...args, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function done(res, data) {
  res.done({ code: 0, data });
}

function normalizeList(value) {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value])
    .map(item => String(item || '').trim())
    .filter(Boolean);
}

function addFlags(hexo, post) {
  if (!post) return post;
  post.documentId = ensureDocumentId(hexo, post);
  post.isDraft = post.source && post.source.indexOf('_draft') === 0;
  post.isDiscarded = post.source && post.source.indexOf('_discarded') === 0;
  return post;
}

function stripHeavyFields(post) {
  const { site, raw, content, more, tags, _content, categories, ...rest } = post;
  return rest;
}

function stripAnsi(str) {
  return String(str || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

module.exports = function (app, hexo, use, db) {
  const settingsDb = db.settingsDb;

  async function getSettings() {
    const settings = await promisifyDb(settingsDb, 'findOne', { type: 'mcp' });
    return settings || {
      type: 'mcp',
      enabled: false,
      scopes: DEFAULT_MCP_SCOPES
    };
  }

  async function saveSettings(settings) {
    const existing = await promisifyDb(settingsDb, 'findOne', { type: 'mcp' });
    const next = {
      ...settings,
      type: 'mcp',
      updatedAt: new Date()
    };
    if (existing) {
      await promisifyDb(settingsDb, 'update', { type: 'mcp' }, { $set: next }, {});
      return { ...existing, ...next };
    }
    next.createdAt = new Date();
    await promisifyDb(settingsDb, 'insert', next);
    return next;
  }

  function hermesConfig(token) {
    return createHermesConfig({ baseDir: hexo.base_dir, token });
  }

  async function requireMcp(req, res, requiredScopes) {
    const settings = await getSettings();
    const token = req.headers['x-hexo-pro-mcp-token'] || req.headers['x-mcp-token'];
    const result = verifyMcpToken(settings, token, requiredScopes);
    if (!result.ok) {
      res.statusCode = result.reason === 'mcp.scope.denied' ? 403 : 401;
      res.setHeader('Content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ code: res.statusCode, msg: result.reason }));
      return null;
    }
    return settings;
  }

  function setDeployStatus(update) {
    return promisifyDb(db.deployStatusDb, 'update', { type: 'status' }, { $set: update }, { upsert: true });
  }

  async function executeSimpleDeploy(options = {}) {
    const logs = [];
    const addLog = async (message) => {
      const clean = stripAnsi(message);
      logs.push(clean);
      await setDeployStatus({ logs: logs.slice(-200) });
    };


    try {
      await setDeployStatus({
        isDeploying: true,
        progress: 5,
        stage: 'started',
        error: null,
        logs: ['mcp.deploy.started']
      });
      logs.push('mcp.deploy.started');

      if (!options.skipGenerate) {
        await setDeployStatus({ progress: 30, stage: 'generate' });
        await addLog('hexo generate');
        await hexo.call('generate');
      }

      await setDeployStatus({ progress: 70, stage: 'deploy' });
      await addLog('hexo deploy');
      await hexo.call('deploy');

      await setDeployStatus({
        isDeploying: false,
        progress: 100,
        stage: 'completed',
        lastDeployTime: new Date().toISOString(),
        error: null,
        logs
      });
    } catch (error) {
      await setDeployStatus({
        isDeploying: false,
        progress: 100,
        stage: 'failed',
        error: error.message,
        logs
      });
    }
  }

  function updatePostByPermalink(permalink, update) {
    return new Promise((resolve, reject) => {
      updatePostFile(permalink, update, (err, post) => {
        if (err) reject(err);
        else resolve(addFlags(hexo, _.cloneDeep(post)));
      }, hexo);
    });
  }

  async function movePost(reference, targetDir, baseRevision) {
    return addFlags(hexo, await movePostFile(hexo, reference, targetDir, baseRevision));
  }

  use('mcp/status', async function (req, res) {
    try {
      const settings = await getSettings();
      done(res, {
        ...publicMcpSettings(settings),
        hermesConfig: hermesConfig()
      });
    } catch (error) {
      res.send(error.statusCode || 500, error.message || '获取 MCP 状态失败');
    }
  });

  use('mcp/enable', async function (req, res, next) {
    if (req.method !== 'POST') return next();
    try {
      const body = req.body || {};
      const created = createMcpToken({ scopes: normalizeList(body.scopes) });
      const settings = await saveSettings(created.settings);
      done(res, {
        ...publicMcpSettings(settings),
        token: created.token,
        hermesConfig: hermesConfig(created.token)
      });
    } catch (error) {
      res.send(error.statusCode || 500, error.message || '开启 MCP Server 失败');
    }
  });

  use('mcp/update', async function (req, res, next) {
    if (req.method !== 'POST') return next();
    try {
      const current = await getSettings();
      const body = req.body || {};
      const settings = await saveSettings({
        ...current,
        enabled: body.enabled !== undefined ? Boolean(body.enabled) : current.enabled,
        scopes: body.scopes ? normalizeList(body.scopes) : current.scopes
      });
      done(res, {
        ...publicMcpSettings(settings),
        hermesConfig: hermesConfig()
      });
    } catch (error) {
      res.send(error.statusCode || 500, error.message || '更新 MCP 设置失败');
    }
  });

  use('mcp/rotate-token', async function (req, res, next) {
    if (req.method !== 'POST') return next();
    try {
      const current = await getSettings();
      const created = createMcpToken({ scopes: normalizeList((req.body || {}).scopes || current.scopes) });
      const settings = await saveSettings({
        ...current,
        ...created.settings,
        enabled: current.enabled !== false
      });
      done(res, {
        ...publicMcpSettings(settings),
        token: created.token,
        hermesConfig: hermesConfig(created.token)
      });
    } catch (error) {
      res.send(error.statusCode || 500, error.message || '轮换 MCP Token 失败');
    }
  });

  use('mcp/agent/posts/list', async function (req, res) {
    try {
      if (!(await requireMcp(req, res, ['read']))) return;
      const body = req.body || {};
      const page = Math.max(parseInt(body.page || 1, 10), 1);
      const pageSize = Math.max(parseInt(body.pageSize || 12, 10), 1);
      const published = body.published !== false;
      const posts = hexo.model('Post').toArray().map(post => addFlags(hexo, _.cloneDeep(post)))
        .filter(post => published ? !post.isDraft && !post.isDiscarded : post.isDraft && !post.isDiscarded)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      done(res, {
        total: posts.length,
        data: posts.slice((page - 1) * pageSize, page * pageSize).map(stripHeavyFields)
      });
    } catch (error) {
      res.send(error.statusCode || 500, error.message || 'MCP 获取文章列表失败');
    }
  });

  use('mcp/agent/posts/get', async function (req, res) {
    try {
      if (!(await requireMcp(req, res, ['read']))) return;
      const body = req.body || {};
      const post = await readDocument(hexo, 'Post', body.documentId || body.permalink);
      done(res, addFlags(hexo, post));
    } catch (error) {
      res.send(error.statusCode || 500, error.message || 'MCP 获取文章失败');
    }
  });

  use('mcp/agent/posts/search', async function (req, res) {
    try {
      if (!(await requireMcp(req, res, ['read']))) return;
      const query = String((req.body || {}).query || '').toLowerCase();
      const posts = hexo.model('Post').toArray().map(post => addFlags(hexo, _.cloneDeep(post)))
        .filter(post => !post.isDiscarded)
        .filter(post => {
          if (!query) return true;
          return String(post.title || '').toLowerCase().includes(query)
            || String(post._content || post.content || '').toLowerCase().includes(query);
        })
        .slice(0, 20)
        .map(post => ({
          permalink: post.permalink,
          documentId: post.documentId,
          isDraft: post.isDraft,
          title: post.title,
          source: post.source
        }));
      done(res, { data: posts });
    } catch (error) {
      res.send(error.statusCode || 500, error.message || 'MCP 搜索文章失败');
    }
  });

  use('mcp/agent/posts/create-draft', async function (req, res) {
    try {
      if (!(await requireMcp(req, res, ['write']))) return;
      const body = req.body || {};
      if (!body.title) return res.send(400, 'No title given');
      validateFilename(body.title);
      resolveSource(hexo, '_drafts/.hexopro-create-check.md');
      const postParameters = { title: body.title, layout: 'draft', date: new Date(), author: hexo.config.author };
      const tags = normalizeList(body.tags);
      const categories = normalizeList(body.categories);
      if (tags.length) postParameters.tags = tags;
      if (categories.length) postParameters.categories = categories;
      const file = await hexo.post.create(postParameters);
      const source = file.path.slice(hexo.source_dir.length).replace(/\\/g, '/');
      await hexo.source.process([source]);
      const created = hexo.model('Post').findOne({ source });
      assignNewDocumentId(hexo, 'Post', created);
      let post = withRevision(hexo, addFlags(hexo, _.cloneDeep(created)));
      if (body.content) {
        post = await updatePostByPermalink(post.documentId, { _content: body.content });
      }
      done(res, post);
    } catch (error) {
      res.send(error.statusCode || 500, error.message || 'MCP 创建草稿失败');
    }
  });

  use('mcp/agent/posts/update', async function (req, res) {
    try {
      if (!(await requireMcp(req, res, ['write']))) return;
      const body = req.body || {};
      if (!body.documentId && !body.permalink) return res.send(400, 'No document ID or permalink given');
      const allowed = new Set(['documentId', 'permalink', 'title', 'content', 'tags', 'categories', 'frontMatter', 'rawUpdate', 'baseRevision']);
      for (const key of Object.keys(body)) if (!allowed.has(key)) throw invalid(`不允许修改文章字段：${key}`);
      if (body.rawUpdate !== undefined) updateAny.validateUpdate(body.rawUpdate);
      const update = {};
      if (body.title !== undefined) update.title = body.title;
      if (body.content !== undefined) update._content = body.content;
      if (body.tags !== undefined) update.tags = body.tags;
      if (body.categories !== undefined) update.categories = body.categories;
      if (body.frontMatter !== undefined) update.frontMatter = body.frontMatter;
      if (body.rawUpdate) Object.assign(update, body.rawUpdate);
      if (body.baseRevision !== undefined) update.baseRevision = body.baseRevision;
      done(res, await updatePostByPermalink(body.documentId || body.permalink, update));
    } catch (error) {
      sendDocumentError(res, error, 500);
    }
  });

  use('mcp/agent/posts/publish', async function (req, res) {
    try {
      if (!(await requireMcp(req, res, ['publish']))) return;
      done(res, await movePost((req.body || {}).documentId || (req.body || {}).permalink, '_posts', (req.body || {}).baseRevision));
    } catch (error) {
      sendDocumentError(res, error, 500);
    }
  });

  use('mcp/agent/posts/unpublish', async function (req, res) {
    try {
      if (!(await requireMcp(req, res, ['publish']))) return;
      done(res, await movePost((req.body || {}).documentId || (req.body || {}).permalink, '_drafts', (req.body || {}).baseRevision));
    } catch (error) {
      sendDocumentError(res, error, 500);
    }
  });

  use('mcp/agent/deploy/status', async function (req, res) {
    try {
      if (!(await requireMcp(req, res, ['deploy']))) return;
      const deployStatusDb = db.deployStatusDb;
      const status = await promisifyDb(deployStatusDb, 'findOne', { type: 'status' });
      done(res, status || { isDeploying: false, progress: 0, stage: 'idle', logs: [] });
    } catch (error) {
      res.send(error.statusCode || 500, error.message || 'MCP 获取部署状态失败');
    }
  });

  use('mcp/agent/deploy/execute', async function (req, res) {
    try {
      if (!(await requireMcp(req, res, ['deploy']))) return;
      const current = await promisifyDb(db.deployStatusDb, 'findOne', { type: 'status' });
      if (current && current.isDeploying) return res.send(400, '部署正在进行中');
      executeSimpleDeploy(req.body || {}).catch(error => {
        console.error('[Hexo Pro MCP]: deploy failed:', error);
      });
      done(res, { success: true, message: 'MCP 部署已开始，请查询部署状态' });
    } catch (error) {
      res.send(error.statusCode || 500, error.message || 'MCP 执行部署失败');
    }
  });
};
